// live Neo4j behavioural suite (gated by RUN_RETRIEVAL_EVAL=1)

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Driver } from "neo4j-driver";
import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import { neo4jField, neo4jIntSchema } from "../../engine/neo4j/record";
import { retrieveMemories } from "../../engine/neo4j/memory/retrieve";
import {
  createMemory,
  findMemoryBySimilarity,
  updateMemory,
} from "../../engine/neo4j/memory/crud";
import { deduplicateMemories } from "../../engine/neo4j/memory/dedup";
import { computeContentHash } from "../../engine/neo4j/memory/mappers";
import {
  createProposedUpdate,
  listProposedUpdates,
  resolveProposal,
} from "../../engine/neo4j/memory/proposals";
import type { MemoryStatus } from "../../engine/neo4j/memory/types";

const runLive = process.env.RUN_RETRIEVAL_EVAL === "1";

const USER = "user_vmem_behavioral_test";
const PROFILE = "profile_behavioral_test";
const SOURCE = "behavioral-test";
const EMBED_DIM = 1536;

function vec(fill: (i: number) => number): number[] {
  return Array.from({ length: EMBED_DIM }, (_, i) => fill(i));
}
const EMB_A = vec((i) => (i === 0 ? 1 : 0));
const EMB_ORTHOGONAL = vec((i) => (i === 1 ? 1 : 0));

async function wipeUser(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `MATCH (p:ProposedUpdate)-[:UPDATE_FOR]->(m:Memory {userId: $userId})
       DETACH DELETE p`,
      { userId: USER },
    );
    await session.run(`MATCH (m:Memory {userId: $userId}) DETACH DELETE m`, {
      userId: USER,
    });
  } finally {
    await session.close();
  }
}

async function countMemories(driver: Driver): Promise<number> {
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (m:Memory {userId: $userId}) RETURN count(m) AS c`,
      { userId: USER },
    );
    const record = res.records[0];
    return record ? neo4jField(record, "c", neo4jIntSchema) : 0;
  } finally {
    await session.close();
  }
}

async function getContent(
  driver: Driver,
  memoryId: string,
): Promise<string | null> {
  const session = driver.session();
  try {
    const res = await session.run(
      `MATCH (m:Memory {id: $memoryId}) RETURN m.content AS content`,
      { memoryId },
    );
    const record = res.records[0];
    return record ? String(record.get("content")) : null;
  } finally {
    await session.close();
  }
}

async function create(
  driver: Driver,
  opts: {
    title: string;
    content: string;
    embedding?: number[];
    status?: MemoryStatus;
  },
): Promise<string> {
  const created = await createMemory(driver, {
    userId: USER,
    profileId: PROFILE,
    title: opts.title,
    content: opts.content,
    type: "knowledge",
    source: SOURCE,
    tags: [],
    confidence: 0.9,
    embedding: opts.embedding ?? null,
    contentHash: computeContentHash(opts.title, opts.content),
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

    // identical embedding → cosine 1.0 ≥ 0.95 → flagged as a near-duplicate
    const match = await findSimilarWithRetry(driver, EMB_A, 0.95);
    expect(match?.id).toBe(id);

    // orthogonal embedding → cosine 0 < 0.95 → not a duplicate
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

    const before = await retrieveMemories(driver, {
      userId: USER,
      query: "Zylophthalmic",
      queryEmbedding: null,
      limit: 10,
    });
    expect(before.some((c) => c.id === id)).toBe(true);

    await updateMemory(driver, USER, id, { status: "suppressed" });

    const after = await retrieveMemories(driver, {
      userId: USER,
      query: "Zylophthalmic",
      queryEmbedding: null,
      limit: 10,
    });
    expect(after.some((c) => c.id === id)).toBe(false);
  }, 60_000);

  it("keeps pinned memories retrievable", async () => {
    const token = "Frobnication threshold setting";
    const id = await create(driver, {
      title: token,
      content: `${token} is configurable per tenant.`,
      status: "pinned",
    });

    const result = await retrieveMemories(driver, {
      userId: USER,
      query: "Frobnication",
      queryEmbedding: null,
      limit: 10,
    });
    expect(result.some((c) => c.id === id)).toBe(true);
  }, 60_000);

  it("returns a full score breakdown in the Context Trace", async () => {
    const token = "Quux subsystem heartbeat interval";
    await create(driver, {
      title: token,
      content: `${token} is thirty seconds by default.`,
    });

    const result = await retrieveMemories(driver, {
      userId: USER,
      query: "Quux heartbeat",
      queryEmbedding: null,
      limit: 10,
    });
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

  it("applies a proposed update on approve and preserves it on reject", async () => {
    // approve path: the proposal surfaces, then supersedes on approval
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

    await resolveProposal(driver, proposal.id, "approve");
    expect(await getContent(driver, id)).toBe(
      "Passwords are hashed with Argon2id.",
    );

    // reject path: the memory is preserved and the proposal stops being pending
    const id2 = await create(driver, {
      title: "Primary region",
      content: "Production runs in us-east-1.",
    });
    const proposal2 = await createProposedUpdate(driver, {
      memoryId: id2,
      proposedContent: "Production runs in eu-west-1.",
      reason: "test reject path",
    });
    await resolveProposal(driver, proposal2.id, "reject");
    expect(await getContent(driver, id2)).toBe("Production runs in us-east-1.");
    const stillPending = (await listProposedUpdates(driver, USER)).some(
      (p) => p.id === proposal2.id,
    );
    expect(stillPending).toBe(false);
  }, 60_000);
});
