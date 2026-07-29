// AI-generated (Claude), prompt: "live neo4j behavioural suite for memory crud retrieve enrich and proposals"
// Modified by me: gated on retrieval eval env and kept the existing header note
// live neo4j behavioural suite, gated by RUN_RETRIEVAL_EVAL=1

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Driver } from "neo4j-driver";
import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import { retrieveMemories } from "../../engine/neo4j/memory/retrieve";
import {
  createMemory,
  deleteMemoriesBySourceTypes,
  deleteAllMemoriesForUser,
  findMemoryBySimilarity,
  getMemory,
  listMemories,
  updateMemory,
} from "../../engine/neo4j/memory/crud";
import { deduplicateMemories } from "../../engine/neo4j/memory/dedup";
import { applyEnrichment } from "../../engine/neo4j/memory/enrichment";
import { getGraphData, getLocalGraph } from "../../engine/neo4j/memory/graph";
import { computeContentHash } from "../../engine/neo4j/memory/mappers";
import {
  createProposedDelete,
  createProposedUpdate,
  listProposedUpdates,
  resolveProposal,
} from "../../engine/neo4j/memory/proposals";
import { firstNeo4jInt } from "../../engine/neo4j/record";
import type { MemoryReadScope } from "../../engine/neo4j/memory/scope";
import type { MemoryStatus } from "../../engine/neo4j/memory/types";

const runLive = process.env.RUN_RETRIEVAL_EVAL === "1";

const USER = "user_vmem_behavioral_test";
const USER_SCOPE: MemoryReadScope = { kind: "personal", userId: USER };
const PROFILE = "profile_behavioral_test";
const SOURCE = "behavioral-test";
const EMBED_DIM = 1536;

function vec(fill: (i: number) => number): number[] {
  return Array.from({ length: EMBED_DIM }, (_, i) => fill(i));
}
const EMB_A = vec((i) => (i === 0 ? 1 : 0));
const EMB_ORTHOGONAL = vec((i) => (i === 1 ? 1 : 0));

async function wipeUser(driver: Driver): Promise<void> {
  await deleteAllMemoriesForUser(driver, USER);
}

async function countMemories(driver: Driver): Promise<number> {
  const { total } = await listMemories(driver, {
    userId: USER,
    limit: 1,
    offset: 0,
  });
  return total;
}

async function getContent(
  driver: Driver,
  memoryId: string,
): Promise<string | null> {
  const memory = await getMemory(driver, USER, memoryId);
  return memory?.content ?? null;
}

async function retrieve(driver: Driver, query: string) {
  return retrieveMemories(driver, {
    scope: { kind: "personal", userId: USER },
    query,
    queryEmbedding: null,
    limit: 10,
  });
}

async function create(
  driver: Driver,
  opts: {
    title: string;
    content: string;
    embedding?: number[];
    status?: MemoryStatus;
    source?: string;
    sourceType?: string;
  },
): Promise<string> {
  const created = await createMemory(driver, {
    userId: USER,
    profileId: PROFILE,
    graphScope: "personal",
    title: opts.title,
    content: opts.content,
    type: "knowledge",
    source: opts.source ?? SOURCE,
    tags: [],
    confidence: 0.9,
    embedding: opts.embedding ?? null,
    contentHash: computeContentHash(opts.title, opts.content),
    sourceType: opts.sourceType,
  });
  if (opts.status !== undefined) {
    await updateMemory(driver, USER, created.id, { status: opts.status });
  }
  return created.id;
}

async function findSimilarWithRetry(
  driver: Driver,
  embedding: number[],
  threshold: number,
): Promise<{ id: string; similarity: number } | null> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const match = await findMemoryBySimilarity(
      driver,
      USER,
      embedding,
      threshold,
    );
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

async function countByQuery(
  driver: Driver,
  cypher: string,
  params: Record<string, unknown>,
): Promise<number> {
  const result = await driver.executeQuery(cypher, params);
  return firstNeo4jInt(result, "total");
}

describe.skipIf(!runLive)("vmem behavioural suite (live Neo4j)", () => {
  let driver: Driver;

  beforeAll(() => {
    driver = getDriver();
  });
  afterAll(async () => {
    await wipeUser(driver);
    await closeDriver();
  });
  beforeEach(async () => {
    await wipeUser(driver);
  });

  it("collapses exact-duplicate memories by content hash", async () => {
    const title = "Deploy key rotates every ninety days";
    const content = "The deployment signing key is rotated quarterly.";
    await create(driver, { title, content });
    await create(driver, { title, content }); // identical → same content hash

    expect(await countMemories(driver)).toBe(2);
    const deleted = await deduplicateMemories(driver, USER);
    expect(deleted).toBe(1);
    expect(await countMemories(driver)).toBe(1);
  }, 60_000);

  it("detects a near-duplicate at the 0.95 semantic threshold", async () => {
    const id = await create(driver, {
      title: "Cache entries expire after five minutes",
      content: "The read cache holds values five minutes before refetching.",
      embedding: EMB_A,
    });

    // identical embedding scores 1.0, above the 0.95 duplicate threshold
    const match = await findSimilarWithRetry(driver, EMB_A, 0.95);
    expect(match?.id).toBe(id);

    // orthogonal embedding scores below threshold, so not a duplicate
    const noMatch = await findMemoryBySimilarity(
      driver,
      USER,
      EMB_ORTHOGONAL,
      0.95,
    );
    expect(noMatch).toBeNull();
  }, 60_000);

  it("excludes suppressed memories from retrieval", async () => {
    const token = "Zylophthalmic widget calibration";
    const id = await create(driver, {
      title: token,
      content: `${token} procedure is documented here.`,
    });

    const before = await retrieve(driver, "Zylophthalmic");
    expect(before.some((c) => c.id === id)).toBe(true);

    await updateMemory(driver, USER, id, { status: "suppressed" });

    const after = await retrieve(driver, "Zylophthalmic");
    expect(after.some((c) => c.id === id)).toBe(false);
  }, 60_000);

  it("keeps pinned memories retrievable", async () => {
    const token = "Frobnication threshold setting";
    const id = await create(driver, {
      title: token,
      content: `${token} is configurable per tenant.`,
      status: "pinned",
    });

    const result = await retrieve(driver, "Frobnication");
    expect(result.some((c) => c.id === id)).toBe(true);
  }, 60_000);

  it("returns a full score breakdown in the Context Trace", async () => {
    const token = "Quux subsystem heartbeat interval";
    await create(driver, {
      title: token,
      content: `${token} is thirty seconds by default.`,
    });

    const result = await retrieve(driver, "Quux heartbeat");
    expect(result.length).toBeGreaterThan(0);
    const top = result[0];
    if (top === undefined) throw new Error("expected at least one candidate");

    const breakdown = top.trace.scoreBreakdown;
    expect(typeof top.trace.score).toBe("number");
    expect(top.trace.reason.length).toBeGreaterThan(0);
    expect(typeof breakdown.fulltext).toBe("number");
    expect(typeof breakdown.vector).toBe("number");
    expect(typeof breakdown.chunk).toBe("number");
    expect(typeof breakdown.entity).toBe("number");
    expect(typeof breakdown.rrf).toBe("number");
    expect(typeof breakdown.recency).toBe("number");
    expect(typeof breakdown.confidence).toBe("number");
  }, 60_000);

  it("cleans source-specific data without deleting all user entities", async () => {
    const browserId = await create(driver, {
      title: "Browser source memory",
      content: "Browser memory mentions Mercury.",
      source: "browser-source",
      sourceType: "browser",
    });
    const driveId = await create(driver, {
      title: "Drive source memory",
      content: "Drive memory mentions Apollo.",
      source: "drive-source",
      sourceType: "drive",
    });
    await applyEnrichment(
      driver,
      browserId,
      USER,
      ["source-cleanup"],
      [],
      [{ name: "Mercury", normalizedName: "mercury", type: "technology" }],
    );
    await applyEnrichment(
      driver,
      driveId,
      USER,
      ["source-cleanup"],
      [],
      [{ name: "Apollo", normalizedName: "apollo", type: "technology" }],
    );

    expect(await deleteMemoriesBySourceTypes(driver, USER, ["browser"])).toBe(
      1,
    );
    expect(await getMemory(driver, USER, browserId)).toBeNull();
    expect(await getMemory(driver, USER, driveId)).not.toBeNull();
    expect(
      await countByQuery(
        driver,
        "MATCH (e:Entity {userId: $userId}) RETURN count(e) AS total",
        { userId: USER },
      ),
    ).toBe(2);

    await deleteAllMemoriesForUser(driver, USER);
    expect(
      await countByQuery(
        driver,
        "MATCH (e:Entity {userId: $userId}) RETURN count(e) AS total",
        { userId: USER },
      ),
    ).toBe(0);
  }, 60_000);

  it("preserves mention edges when enrichment returns no entities", async () => {
    const id = await create(driver, {
      title: "Known entity retention",
      content: "The memory mentions Graphite.",
    });
    await applyEnrichment(
      driver,
      id,
      USER,
      ["retention"],
      [],
      [{ name: "Graphite", normalizedName: "graphite", type: "technology" }],
    );
    await applyEnrichment(driver, id, USER, ["retention"], [], []);

    expect(
      await countByQuery(
        driver,
        `MATCH (:Memory {id: $memoryId, userId: $userId})-[r:MENTIONS]->(:Entity)
         RETURN count(r) AS total`,
        { memoryId: id, userId: USER },
      ),
    ).toBe(1);
  }, 60_000);

  it("applies a proposed update on approve and preserves it on reject", async () => {
    // on approve: the proposal surfaces then supersedes the memory
    const id = await create(driver, {
      title: "Password hashing",
      content: "Passwords are hashed with bcrypt.",
    });
    const proposal = await createProposedUpdate(driver, {
      memoryId: id,
      proposedContent: "Passwords are hashed with Argon2id.",
      reason: "user stated the new algorithm",
    });

    const pending = await listProposedUpdates(driver, USER);
    expect(pending.some((p) => p.id === proposal.id)).toBe(true);
    // the conflict is surfaced for approval, not silently applied
    expect(await getContent(driver, id)).toBe(
      "Passwords are hashed with bcrypt.",
    );

    // a stranger holding the uuid resolves nothing and the proposal stays pending
    expect(
      await resolveProposal(
        driver,
        { kind: "personal", userId: `${USER}_intruder` },
        proposal.id,
        "approve",
      ),
    ).toBeNull();
    expect(await getContent(driver, id)).toBe(
      "Passwords are hashed with bcrypt.",
    );

    await resolveProposal(driver, USER_SCOPE, proposal.id, "approve");
    expect(await getContent(driver, id)).toBe(
      "Passwords are hashed with Argon2id.",
    );

    // on reject: the memory stays and the proposal leaves pending
    const id2 = await create(driver, {
      title: "Primary region",
      content: "Production runs in us-east-1.",
    });
    const proposal2 = await createProposedUpdate(driver, {
      memoryId: id2,
      proposedContent: "Production runs in eu-west-1.",
      reason: "test reject path",
    });
    await resolveProposal(driver, USER_SCOPE, proposal2.id, "reject");
    expect(await getContent(driver, id2)).toBe("Production runs in us-east-1.");
    const stillPending = (await listProposedUpdates(driver, USER)).some(
      (p) => p.id === proposal2.id,
    );
    expect(stillPending).toBe(false);
  }, 60_000);

  it("approves proposal deletes without emitting a memory event", async () => {
    const id = await create(driver, {
      title: "Deprecated runbook",
      content: "This runbook should be deleted.",
    });
    const proposal = await createProposedDelete(driver, {
      memoryId: id,
      reason: "source requested removal",
    });

    const result = await resolveProposal(
      driver,
      USER_SCOPE,
      proposal.id,
      "approve",
    );

    expect(result?.status).toBe("approved");
    expect(await getMemory(driver, USER, id)).toBeNull();
    expect(
      await countByQuery(
        driver,
        `MATCH (p:ProposedUpdate {id: $proposalId, status: 'approved'})
         RETURN count(p) AS total`,
        { proposalId: proposal.id },
      ),
    ).toBe(1);
    expect(
      await countByQuery(
        driver,
        `MATCH (e:MemoryEvent {event: 'proposal_approved'})
         WHERE e.memoryId = $memoryId
         RETURN count(e) AS total`,
        { memoryId: id },
      ),
    ).toBe(0);
  }, 60_000);

  it("omits global graph scores but keeps local graph scores", async () => {
    const sourceId = await create(driver, {
      title: "Graph score source",
      content: "Source graph score fixture.",
    });
    const targetId = await create(driver, {
      title: "Graph score target",
      content: "Target graph score fixture.",
    });
    await driver.executeQuery(
      `MATCH (a:Memory {id: $sourceId, userId: $userId})
       MATCH (b:Memory {id: $targetId, userId: $userId})
       MERGE (a)-[r:RELATES_TO]->(b)
       SET r.reason = 'test score', r.score = 0.42`,
      { sourceId, targetId, userId: USER },
    );

    const globalGraph = await getGraphData(
      driver,
      { kind: "personal", userId: USER, profileId: PROFILE },
      10,
    );
    const globalEdge = globalGraph.relatesToEdges.find(
      (edge) => edge.source === sourceId && edge.target === targetId,
    );
    expect(globalEdge).toEqual({
      source: sourceId,
      target: targetId,
      reason: "test score",
    });

    const localGraph = await getLocalGraph(
      driver,
      { kind: "personal", userId: USER, profileId: PROFILE },
      sourceId,
    );
    const localEdge = localGraph.relatesToEdges.find(
      (edge) => edge.source === sourceId && edge.target === targetId,
    );
    expect(localEdge).toEqual({
      source: sourceId,
      target: targetId,
      reason: "test score",
      score: 0.42,
    });
  }, 60_000);
});
