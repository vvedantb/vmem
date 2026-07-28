// live neo4j suite for team scoping, gated by RUN_RETRIEVAL_EVAL=1
// inside a team profile every member reads and links everyone else's memories
// personal and legacy memories with no profile must not leak in

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Driver } from "neo4j-driver";
import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import { createChunksForMemory } from "../../engine/neo4j/memory/chunks";
import {
  createMemory,
  deleteAllMemoriesForUser,
} from "../../engine/neo4j/memory/crud";
import {
  findMergeCandidates,
  findRecentMemoriesForDream,
  materializeSynthesisAsMemory,
} from "../../engine/neo4j/memory/dreamMode";
import { getGraphData, getLocalGraph } from "../../engine/neo4j/memory/graph";
import { computeContentHash } from "../../engine/neo4j/memory/mappers";
import {
  createSynthesisProposal,
  resolveProposal,
} from "../../engine/neo4j/memory/proposals";
import { retrieveMemories } from "../../engine/neo4j/memory/retrieve";
import type {
  DreamScope,
  MemoryReadScope,
} from "../../engine/neo4j/memory/scope";
import type { MemoryCandidate } from "../../engine/neo4j/memory/types";
import { firstNeo4jInt } from "../../engine/neo4j/record";

const runLive = process.env.RUN_RETRIEVAL_EVAL === "1";

const USER_A = "user_vmem_team_scope_a";
const USER_B = "user_vmem_team_scope_b";
// dream mode attributes derived memories to the team's current owner
const OWNER = "user_vmem_team_scope_owner";
const TEAM_PROFILE = "profile_vmem_team_scope_shared";
const A_PERSONAL_PROFILE = "profile_vmem_team_scope_a_personal";
const B_PERSONAL_PROFILE = "profile_vmem_team_scope_b_personal";
const SOURCE = "team-scope-test";
const EMBED_DIM = 1536;

const TEAM_SCOPE: MemoryReadScope = { kind: "team", profileId: TEAM_PROFILE };
const TEAM_DREAM_SCOPE: DreamScope = {
  kind: "team",
  userId: OWNER,
  profileId: TEAM_PROFILE,
};

function vec(fill: (i: number) => number): number[] {
  return Array.from({ length: EMBED_DIM }, (_, i) => fill(i));
}
const EMB_A = vec((i) => (i === 0 ? 1 : 0));
const EMB_ORTHOGONAL = vec((i) => (i === 1 ? 1 : 0));

interface CreateOpts {
  userId: string;
  profileId: string;
  graphScope: "personal" | "team";
  title: string;
  content: string;
  embedding?: number[];
  source?: string;
}

async function create(driver: Driver, opts: CreateOpts): Promise<string> {
  const created = await createMemory(driver, {
    userId: opts.userId,
    profileId: opts.profileId,
    graphScope: opts.graphScope,
    title: opts.title,
    content: opts.content,
    type: "knowledge",
    source: opts.source ?? SOURCE,
    tags: [],
    confidence: 0.9,
    embedding: opts.embedding ?? null,
    contentHash: computeContentHash(opts.title, opts.content),
  });
  return created.id;
}

// legacy memories predate profiles, strict team scope must exclude them
async function stripProfile(driver: Driver, memoryId: string): Promise<void> {
  await driver.executeQuery(
    `MATCH (m:Memory {id: $memoryId}) SET m.profileId = null`,
    { memoryId },
  );
}

async function relate(
  driver: Driver,
  fromId: string,
  toId: string,
  reason: string,
): Promise<void> {
  await driver.executeQuery(
    `MATCH (a:Memory {id: $fromId}), (b:Memory {id: $toId})
     MERGE (a)-[r:RELATES_TO]->(b)
     SET r.reason = $reason`,
    { fromId, toId, reason },
  );
}

async function mention(
  driver: Driver,
  memoryId: string,
  userId: string,
  name: string,
): Promise<void> {
  await driver.executeQuery(
    `MATCH (m:Memory {id: $memoryId})
     MERGE (e:Entity {userId: $userId, normalizedName: $normalizedName})
     ON CREATE SET e.name = $name, e.type = 'concept', e.memoryCount = 1
     MERGE (m)-[:MENTIONS]->(e)`,
    { memoryId, userId, normalizedName: name.toLowerCase(), name },
  );
}

async function edgeReasons(
  driver: Driver,
  fromId: string,
  toId: string,
): Promise<string[]> {
  const result = await driver.executeQuery(
    `MATCH (a:Memory {id: $fromId})-[r:RELATES_TO]-(b:Memory {id: $toId})
     RETURN collect(r.reason) AS reasons`,
    { fromId, toId },
  );
  const raw = result.records[0]?.get("reasons");
  return Array.isArray(raw) ? raw.map(String) : [];
}

async function countEntities(driver: Driver): Promise<number> {
  const result = await driver.executeQuery(
    `MATCH (e:Entity) WHERE e.userId IN $userIds
     DETACH DELETE e
     RETURN count(e) AS total`,
    { userIds: [USER_A, USER_B] },
  );
  return firstNeo4jInt(result, "total");
}

async function wipe(driver: Driver): Promise<void> {
  await deleteAllMemoriesForUser(driver, USER_A);
  await deleteAllMemoriesForUser(driver, USER_B);
  await deleteAllMemoriesForUser(driver, OWNER);
  await countEntities(driver);
  // proposals outlive their memories, and a stale pending one would trip the
  // overlap guard on the next run
  await driver.executeQuery(
    `MATCH (p:ProposedUpdate {teamProfileId: $profileId}) DETACH DELETE p`,
    { profileId: TEAM_PROFILE },
  );
}

async function retryUntil<T>(
  attempt: () => Promise<T>,
  done: (value: T) => boolean,
): Promise<T> {
  let last = await attempt();
  for (let i = 0; i < 15 && !done(last); i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    last = await attempt();
  }
  return last;
}

function idsOf(candidates: Array<{ id: string }>): string[] {
  return candidates.map((candidate) => candidate.id);
}

const POOLING_QUERY = "connection pooling limits";
const POOLING_TITLE = "Postgres connection pooling limits";
const POOLING_CONTENT = "The shared pool caps at 40 connections per service.";

// full-text is eventually consistent, so leak checks poll until a control memory lands
async function retrieveOnceIndexed(
  driver: Driver,
  scope: MemoryReadScope,
  query: string,
  controlId: string,
): Promise<string[]> {
  const candidates = await retryUntil(
    () =>
      retrieveMemories(driver, {
        scope,
        query,
        queryEmbedding: null,
        limit: 10,
        legs: { vector: false, chunk: false },
      }),
    (result) => idsOf(result).includes(controlId),
  );
  return idsOf(candidates);
}

// graph expansion polls on the full-text seed first
function expansionRetrieveOnceSeeded(
  driver: Driver,
  query: string,
  seedId: string,
): Promise<MemoryCandidate[]> {
  return retryUntil(
    () =>
      retrieveMemories(driver, {
        scope: TEAM_SCOPE,
        query,
        queryEmbedding: null,
        limit: 10,
        legs: { vector: false, chunk: false, entity: false, dedup: false },
      }),
    (result) => idsOf(result).includes(seedId),
  );
}

describe.skipIf(!runLive)("team scope (live Neo4j)", () => {
  let driver: Driver;

  beforeAll(() => {
    driver = getDriver();
  });
  afterAll(async () => {
    await wipe(driver);
    await closeDriver();
  });
  beforeEach(async () => {
    await wipe(driver);
  });

  it("retrieves a teammate's team-profile memory", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: POOLING_TITLE,
      content: POOLING_CONTENT,
    });

    const ids = await retrieveOnceIndexed(
      driver,
      TEAM_SCOPE,
      POOLING_QUERY,
      aTeam,
    );

    expect(ids).toContain(aTeam);
  });

  it("never leaks a member's personal-profile memory into team scope", async () => {
    // member b's team memory warms the index before we assert the leak
    const bTeam = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: POOLING_TITLE,
      content: POOLING_CONTENT,
    });
    const aPersonal = await create(driver, {
      userId: USER_A,
      profileId: A_PERSONAL_PROFILE,
      graphScope: "personal",
      title: POOLING_TITLE,
      content: "My own note about connection pooling.",
    });

    const ids = await retrieveOnceIndexed(
      driver,
      TEAM_SCOPE,
      POOLING_QUERY,
      bTeam,
    );

    expect(ids).toContain(bTeam);
    expect(ids).not.toContain(aPersonal);
  });

  it("never leaks a profile-less legacy memory into team scope", async () => {
    const bTeam = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: POOLING_TITLE,
      content: POOLING_CONTENT,
    });
    const legacy = await create(driver, {
      userId: USER_A,
      profileId: A_PERSONAL_PROFILE,
      graphScope: "personal",
      title: POOLING_TITLE,
      content: "Legacy note with no profile at all.",
    });
    await stripProfile(driver, legacy);

    const ids = await retrieveOnceIndexed(
      driver,
      TEAM_SCOPE,
      POOLING_QUERY,
      bTeam,
    );

    expect(ids).toContain(bTeam);
    expect(ids).not.toContain(legacy);
  });

  it("keeps personal scope private between members", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: POOLING_TITLE,
      content: POOLING_CONTENT,
    });
    const bOwn = await create(driver, {
      userId: USER_B,
      profileId: B_PERSONAL_PROFILE,
      graphScope: "personal",
      title: POOLING_TITLE,
      content: "B's own note about connection pooling.",
    });

    const ids = await retrieveOnceIndexed(
      driver,
      { kind: "personal", userId: USER_B, profileId: B_PERSONAL_PROFILE },
      POOLING_QUERY,
      bOwn,
    );

    expect(ids).toContain(bOwn);
    expect(ids).not.toContain(aTeam);
  });

  it("fans the chunk leg out across members", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "Runbook",
      content: "A long runbook stored in chunks.",
    });
    await createChunksForMemory(driver, {
      memoryId: aTeam,
      userId: USER_A,
      chunks: [
        {
          content: "Restart the ingest worker before the API.",
          startOffset: 0,
          endOffset: 40,
        },
      ],
      embeddings: [EMB_A],
    });

    const candidates = await retryUntil(
      () =>
        retrieveMemories(driver, {
          scope: TEAM_SCOPE,
          query: "restart order",
          queryEmbedding: EMB_A,
          limit: 10,
          legs: {
            fulltext: false,
            vector: false,
            entity: false,
            graph: false,
            dedup: false,
          },
        }),
      (result) => result.some((candidate) => candidate.id === aTeam),
    );

    const hit = candidates.find((candidate) => candidate.id === aTeam);
    expect(hit?.matchedChunk?.content).toBe(
      "Restart the ingest worker before the API.",
    );
  });

  it("surfaces a teammate's neighbour through graph expansion with a real trace", async () => {
    const seed = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "Ingest worker restart order",
      content: "Restart ingest before the API.",
    });
    const neighbour = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "API warmup window",
      content: "The API needs ninety seconds to warm up.",
    });
    await relate(driver, seed, neighbour, "test link");

    const candidates = await expansionRetrieveOnceSeeded(
      driver,
      "ingest worker restart order",
      seed,
    );

    const hit = candidates.find((candidate) => candidate.id === neighbour);
    expect(hit).toBeDefined();
    // hydration ran under team scope, so the graph trace is real, not fabricated
    expect(hit?.trace.scoreBreakdown.graphPath?.hops).toBe(1);
  });

  it("never expands into a personal memory through a shared entity", async () => {
    const seed = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "Ingest worker restart order",
      content: "Restart ingest before the API.",
    });
    const aPersonal = await create(driver, {
      userId: USER_A,
      profileId: A_PERSONAL_PROFILE,
      graphScope: "personal",
      title: "Private ingest notes",
      content: "My own thoughts on the ingest worker.",
    });
    await mention(driver, seed, USER_A, "ingest worker");
    await mention(driver, aPersonal, USER_A, "ingest worker");

    const candidates = await expansionRetrieveOnceSeeded(
      driver,
      "ingest worker restart order",
      seed,
    );

    expect(idsOf(candidates)).toContain(seed);
    expect(idsOf(candidates)).not.toContain(aPersonal);
  });

  it("returns both members' nodes and cross-member edges from the team graph", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "A team note",
      content: "Owned by A, shared with the team.",
    });
    const bTeam = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "B team note",
      content: "Owned by B, shared with the team.",
    });
    await relate(driver, aTeam, bTeam, "cross member");

    const aPersonal = await create(driver, {
      userId: USER_A,
      profileId: A_PERSONAL_PROFILE,
      graphScope: "personal",
      title: "A private note",
      content: "Not for the team.",
    });
    const legacy = await create(driver, {
      userId: USER_A,
      profileId: A_PERSONAL_PROFILE,
      graphScope: "personal",
      title: "A legacy note",
      content: "No profile at all.",
    });
    await stripProfile(driver, legacy);

    const graph = await getGraphData(driver, TEAM_SCOPE, 50);
    const nodeIds = graph.nodes.map((node) => node.id);

    expect(nodeIds).toContain(aTeam);
    expect(nodeIds).toContain(bTeam);
    expect(nodeIds).not.toContain(aPersonal);
    expect(nodeIds).not.toContain(legacy);
    expect(graph.relatesToEdges).toContainEqual({
      source: aTeam,
      target: bTeam,
      reason: "cross member",
      score: undefined,
    });
  });

  it("focuses the local graph on a teammate's memory", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "A team note",
      content: "Owned by A, shared with the team.",
    });
    const bTeam = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "B team note",
      content: "Owned by B, shared with the team.",
    });
    await relate(driver, aTeam, bTeam, "cross member");

    // member b can focus a node owned by a, old scoping keyed on user-id blocked this
    const graph = await getLocalGraph(driver, TEAM_SCOPE, aTeam);

    expect(graph.focusNodeId).toBe(aTeam);
    expect(graph.nodes.map((node) => node.id)).toContain(bTeam);
  });

  it("links near-identical memories across members inside a team profile", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "Deploy freeze window",
      content: "No deploys between Friday 16:00 and Monday 09:00.",
      embedding: EMB_A,
    });

    // the vector index lags the write, so retry the create-driven edge check
    const reasons = await retryUntil(
      async () => {
        const bTeam = await create(driver, {
          userId: USER_B,
          profileId: TEAM_PROFILE,
          graphScope: "team",
          title: "Deploy freeze window",
          content: "Deploys are frozen from Friday evening to Monday morning.",
          embedding: EMB_A,
        });
        return edgeReasons(driver, aTeam, bTeam);
      },
      (result) => result.includes("semantic similarity"),
    );

    expect(reasons).toContain("semantic similarity");
  });

  it("never links members' personal memories to each other", async () => {
    const aFirst = await create(driver, {
      userId: USER_A,
      profileId: A_PERSONAL_PROFILE,
      graphScope: "personal",
      title: "Deploy freeze window",
      content: "No deploys over the weekend.",
      embedding: EMB_A,
    });

    // proves the vector index is live before asserting an absence
    const aSecondId = await retryUntil(
      async () => {
        const aSecond = await create(driver, {
          userId: USER_A,
          profileId: A_PERSONAL_PROFILE,
          graphScope: "personal",
          title: "Deploy freeze window restated",
          content: "Weekend deploys are not allowed.",
          embedding: EMB_A,
        });
        const reasons = await edgeReasons(driver, aFirst, aSecond);
        return reasons.includes("semantic similarity") ? aSecond : "";
      },
      (value) => value !== "",
    );
    expect(aSecondId).not.toBe("");

    const bPersonal = await create(driver, {
      userId: USER_B,
      profileId: B_PERSONAL_PROFILE,
      graphScope: "personal",
      title: "Deploy freeze window",
      content: "No deploys over the weekend.",
      embedding: EMB_A,
    });

    expect(await edgeReasons(driver, aFirst, bPersonal)).toEqual([]);
  });

  it("keeps same-session edges per member inside a team profile", async () => {
    const aFirst = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "A first",
      content: "First note in A's session.",
    });
    const aSecond = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "A second",
      content: "Second note in A's session.",
    });
    const bFirst = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "B first",
      content: "First note in B's session.",
    });

    expect(await edgeReasons(driver, aFirst, aSecond)).toContain(
      "same session",
    );
    // two members writing within the window are not one session
    expect(await edgeReasons(driver, aSecond, bFirst)).toEqual([]);
  });

  it("does not link a team memory to the creator's personal memory", async () => {
    const aPersonal = await create(driver, {
      userId: USER_A,
      profileId: A_PERSONAL_PROFILE,
      graphScope: "personal",
      title: "A private note",
      content: "Written moments before the team note.",
      embedding: EMB_ORTHOGONAL,
    });
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "A team note",
      content: "Written moments after the private note.",
    });

    expect(await edgeReasons(driver, aPersonal, aTeam)).toEqual([]);
  });

  it("feeds both members' memories into a team dream pass", async () => {
    const sinceMs = Date.now() - 60_000;
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "A team note",
      content: "Owned by A, shared with the team.",
      embedding: EMB_A,
    });
    const bTeam = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "B team note",
      content: "Owned by B, shared with the team.",
      embedding: EMB_ORTHOGONAL,
    });
    const aPersonal = await create(driver, {
      userId: USER_A,
      profileId: A_PERSONAL_PROFILE,
      graphScope: "personal",
      title: "A private note",
      content: "Not for the team.",
      embedding: EMB_A,
    });

    const recent = await findRecentMemoriesForDream(driver, {
      scope: TEAM_DREAM_SCOPE,
      sinceMs,
      limit: 50,
    });
    const ids = recent.map((memory) => memory.id);

    // the owner contributed nothing, yet reads both members' work
    expect(ids).toContain(aTeam);
    expect(ids).toContain(bTeam);
    expect(ids).not.toContain(aPersonal);
  });

  it("clusters merge candidates across members", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "Deploy freeze window",
      content: "No deploys between Friday 16:00 and Monday 09:00.",
      embedding: EMB_A,
    });
    const bTeam = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "Deploy freeze window restated",
      content: "Deploys are frozen from Friday evening to Monday morning.",
      embedding: EMB_A,
    });

    const clusters = await retryUntil(
      () =>
        findMergeCandidates(driver, {
          scope: TEAM_DREAM_SCOPE,
          pool: [
            {
              id: aTeam,
              title: "Deploy freeze window",
              content: "No deploys between Friday 16:00 and Monday 09:00.",
              embedding: EMB_A,
            },
          ],
          simThreshold: 0.9,
          maxClusters: 5,
          maxClusterSize: 5,
        }),
      (result) => result.length > 0,
    );

    expect(clusters[0]?.map((member) => member.id).sort()).toEqual(
      [aTeam, bTeam].sort(),
    );
  });

  it("materialises a team synthesis with edges to every member's source", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "A team note",
      content: "Owned by A.",
    });
    const bTeam = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "B team note",
      content: "Owned by B.",
    });

    const derived = await materializeSynthesisAsMemory(driver, {
      userId: OWNER,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "Team synthesis",
      content: "A and B agree.",
      embedding: null,
      contentHash: computeContentHash("Team synthesis", "A and B agree."),
      sourceMemoryIds: [aTeam, bTeam],
      confidence: 0.8,
    });

    const result = await driver.executeQuery(
      `MATCH (d:Memory {id: $id})
       OPTIONAL MATCH (d)-[:DERIVED_FROM]->(src:Memory)
       RETURN d.userId AS userId, d.profileId AS profileId,
              collect(src.id) AS sourceIds`,
      { id: derived.id },
    );
    const record = result.records[0];
    const sourceIds = record?.get("sourceIds");

    expect(record?.get("userId")).toBe(OWNER);
    expect(record?.get("profileId")).toBe(TEAM_PROFILE);
    // the owner-keyed source match used to drop both members' edges silently
    expect(
      Array.isArray(sourceIds) ? sourceIds.map(String).sort() : [],
    ).toEqual([aTeam, bTeam].sort());
  });

  it("approves a team merge proposal against both members' sources", async () => {
    const aTeam = await create(driver, {
      userId: USER_A,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "A team note",
      content: "Owned by A.",
    });
    const bTeam = await create(driver, {
      userId: USER_B,
      profileId: TEAM_PROFILE,
      graphScope: "team",
      title: "B team note",
      content: "Owned by B.",
    });

    const proposal = await createSynthesisProposal(driver, {
      scope: TEAM_DREAM_SCOPE,
      kind: "merge",
      proposedTitle: "Merged team note",
      proposedContent: "A and B say the same thing.",
      reason: "near-duplicate across members",
      sourceMemoryIds: [aTeam, bTeam],
      confidence: 0.85,
    });

    const resolved = await resolveProposal(driver, proposal.id, "approve");
    expect(resolved?.status).toBe("approved");

    const result = await driver.executeQuery(
      `MATCH (d:Memory {id: $id})
       OPTIONAL MATCH (d)-[:DERIVED_FROM]->(src:Memory)
       WITH d, collect(src) AS sources
       RETURN d.userId AS userId, d.profileId AS profileId,
              [s IN sources | s.id] AS sourceIds,
              [s IN sources | s.status] AS sourceStatuses`,
      { id: resolved?.memoryId ?? "" },
    );
    const record = result.records[0];
    const sourceIds = record?.get("sourceIds");
    const sourceStatuses = record?.get("sourceStatuses");

    // materializeUserId carries the owner, so a non-owner still lands the shared memory
    expect(record?.get("userId")).toBe(OWNER);
    expect(record?.get("profileId")).toBe(TEAM_PROFILE);
    expect(
      Array.isArray(sourceIds) ? sourceIds.map(String).sort() : [],
    ).toEqual([aTeam, bTeam].sort());
    expect(
      Array.isArray(sourceStatuses) ? sourceStatuses.map(String) : [],
    ).toEqual(["suppressed", "suppressed"]);
  });
});
