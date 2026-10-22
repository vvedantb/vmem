/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  candidatePairKey,
  classifyCandidate,
} from "../engine/memory/dream/candidates";
import { MEMORY_EMBEDDING_DIMENSIONS } from "../engine/memory/searchableText";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const DAY_MS = 24 * 60 * 60 * 1000;
const CLERK_ID = "clerk_candidates";
const PROFILE_ID = "profile_main";

// no network: the embedding call returns the next fake vector (null = failure)
const nextEmbedding = vi.hoisted(() => {
  const state: { value: number[] | null } = { value: null };
  return state;
});
vi.mock("./lib/openRouter/bestEffortEmbed", () => ({
  bestEffortEmbedOne: vi.fn(async () => nextEmbedding.value),
  bestEffortEmbedMany: vi.fn(async () => []),
  resolveBestEffortEmbedAuth: vi.fn(async () => null),
}));

type T = ReturnType<typeof convexTest>;

// unit vector whose cosine with axis(0) is `cosine`
function atCosine(cosine: number): number[] {
  const out = Array.from({ length: MEMORY_EMBEDDING_DIMENSIONS }, () => 0);
  out[0] = cosine;
  out[1] = Math.sqrt(1 - cosine * cosine);
  return out;
}

let seq = 0;

async function addMemory(
  t: T,
  fields: Partial<Doc<"memories">> = {},
  embedding?: number[],
): Promise<Doc<"memories">> {
  seq += 1;
  const memoryId = `mem_${String(seq)}`;
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert("memories", {
      memoryId,
      userId: CLERK_ID,
      profileId: PROFILE_ID,
      title: `Title ${memoryId}`,
      content: `Content ${memoryId}`,
      type: "knowledge",
      source: "mcp",
      confidence: 1,
      status: "active",
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      contentHash: `hash_${memoryId}`,
      visitCount: 1,
      firstVisitAt: Date.now(),
      lastVisitAt: Date.now(),
      ...fields,
    });
    const doc = await ctx.db.get(id);
    if (!doc) throw new Error("memory missing");
    if (embedding) {
      await ctx.db.insert("memoryEmbeddings", {
        memoryDocId: id,
        userId: doc.userId,
        ...(doc.profileId === undefined ? {} : { profileId: doc.profileId }),
        embedding,
      });
    }
    return doc;
  });
}

async function shareEntity(t: T, memories: Doc<"memories">[]): Promise<void> {
  await t.run(async (ctx) => {
    const entityId = await ctx.db.insert("memoryEntities", {
      userId: CLERK_ID,
      profileId: PROFILE_ID,
      name: "vmem",
      normalizedName: "vmem",
      type: "technology",
      createdAt: Date.now(),
    });
    for (const memory of memories) {
      await ctx.db.insert("memoryEntityMentions", {
        userId: CLERK_ID,
        profileId: PROFILE_ID,
        memoryId: memory.memoryId,
        entityId,
        normalizedName: "vmem",
        createdAt: Date.now(),
      });
    }
  });
}

// runs the write-time embed job for `memory` with `embedding`
async function embed(
  t: T,
  memory: Doc<"memories">,
  embedding: number[] | null,
): Promise<boolean> {
  nextEmbedding.value = embedding;
  return await t.action(internal.memoryEmbed.embedMemoryInternal, {
    clerkId: CLERK_ID,
    memoryId: memory.memoryId,
    profileId: memory.profileId,
    text: memory.content,
  });
}

async function candidates(t: T): Promise<Doc<"dreamCandidates">[]> {
  return await t.run(async (ctx) => ctx.db.query("dreamCandidates").collect());
}

describe("classifyCandidate", () => {
  it("applies the score bands, type and entity rules", () => {
    const rule = (score: number, sameType: boolean, sharedEntity: boolean) =>
      classifyCandidate({ score, sameType, sharedEntity });
    expect(rule(0.97, true, false)).toBe("near_dup");
    expect(rule(0.99, false, true)).toBeNull();
    expect(rule(0.9, true, true)).toBe("maybe_conflict");
    expect(rule(0.9, true, false)).toBeNull();
    expect(rule(0.87, true, true)).toBeNull();
  });

  it("keys a pair the same in either order", () => {
    expect(candidatePairKey("b", "a")).toBe(candidatePairKey("a", "b"));
  });
});

describe("write-time dream candidates", () => {
  beforeEach(() => {
    nextEmbedding.value = null;
  });

  it("flags cosine >= 0.97 with the same type as near_dup", async () => {
    const t = convexTest(schema, modules);
    const old = await addMemory(t, {}, atCosine(1));
    const fresh = await addMemory(t);

    expect(await embed(t, fresh, atCosine(0.99))).toBe(true);

    const rows = await candidates(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: CLERK_ID,
      profileId: PROFILE_ID,
      memoryId: fresh._id,
      neighborId: old._id,
      kind: "near_dup",
      status: "open",
    });
    expect(rows[0]?.score).toBeGreaterThanOrEqual(0.97);
  });

  it("does not flag a near-identical row of another type", async () => {
    const t = convexTest(schema, modules);
    await addMemory(t, { type: "episodic" }, atCosine(1));
    const fresh = await addMemory(t);

    await embed(t, fresh, atCosine(0.99));

    expect(await candidates(t)).toHaveLength(0);
  });

  it("flags 0.9 with a shared entity as maybe_conflict", async () => {
    const t = convexTest(schema, modules);
    const old = await addMemory(t, {}, atCosine(1));
    const fresh = await addMemory(t);
    await shareEntity(t, [old, fresh]);

    await embed(t, fresh, atCosine(0.9));

    const rows = await candidates(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      memoryId: fresh._id,
      neighborId: old._id,
      kind: "maybe_conflict",
    });
  });

  it("does not flag 0.9 without a shared entity", async () => {
    const t = convexTest(schema, modules);
    await addMemory(t, {}, atCosine(1));
    const fresh = await addMemory(t);

    await embed(t, fresh, atCosine(0.9));

    expect(await candidates(t)).toHaveLength(0);
  });

  it("skips low-prior sources on either side", async () => {
    const t = convexTest(schema, modules);
    await addMemory(
      t,
      { source: "browsing-history", sourceType: "browsing-history" },
      atCosine(1),
    );
    const mcp = await addMemory(t);
    await embed(t, mcp, atCosine(0.99));
    expect(await candidates(t)).toHaveLength(0);

    const bookmark = await addMemory(t, { source: "bookmarks" });
    const desktop = await addMemory(t, { source: "desktop" });
    await embed(t, bookmark, atCosine(0.995));
    await embed(t, desktop, atCosine(0.995));
    expect(await candidates(t)).toHaveLength(0);
  });

  it("stores a pair once, whichever row is embedded", async () => {
    const t = convexTest(schema, modules);
    const a = await addMemory(t, {}, atCosine(1));
    const b = await addMemory(t);

    await embed(t, b, atCosine(0.99));
    await embed(t, a, atCosine(1));
    await embed(t, b, atCosine(0.99));

    const rows = await candidates(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pairKey).toBe(candidatePairKey(a._id, b._id));
  });

  it("does not match another profile or user, or a hidden row", async () => {
    const t = convexTest(schema, modules);
    await addMemory(t, { profileId: "profile_other" }, atCosine(1));
    await addMemory(t, { userId: "clerk_other" }, atCosine(1));
    await addMemory(t, { status: "suppressed" }, atCosine(1));
    const fresh = await addMemory(t);

    await embed(t, fresh, atCosine(0.99));

    expect(await candidates(t)).toHaveLength(0);
  });

  it("keeps the write working with no neighbours or a failed embedding", async () => {
    const t = convexTest(schema, modules);
    const lonely = await addMemory(t);
    expect(await embed(t, lonely, atCosine(1))).toBe(true);

    const failed = await addMemory(t);
    expect(await embed(t, failed, null)).toBe(false);

    expect(await candidates(t)).toHaveLength(0);
  });
});

describe("dream candidate retention", () => {
  it("drops rows older than 30 days or with a hidden or deleted memory", async () => {
    const t = convexTest(schema, modules);
    const a = await addMemory(t);
    const b = await addMemory(t);
    const hidden = await addMemory(t, { status: "suppressed" });
    const deleted = await addMemory(t);
    await t.run(async (ctx) => ctx.db.delete(deleted._id));

    const insert = (
      memoryId: Id<"memories">,
      neighborId: Id<"memories">,
      createdAt: number,
    ) =>
      t.run(async (ctx) =>
        ctx.db.insert("dreamCandidates", {
          userId: CLERK_ID,
          profileId: PROFILE_ID,
          memoryId,
          neighborId,
          pairKey: `${memoryId}|${neighborId}|${String(createdAt)}`,
          score: 0.99,
          kind: "near_dup",
          status: "open",
          createdAt,
        }),
      );
    const kept = await insert(a._id, b._id, Date.now() - DAY_MS);
    await insert(a._id, b._id, Date.now() - 31 * DAY_MS);
    await insert(a._id, hidden._id, Date.now());
    await insert(deleted._id, b._id, Date.now());

    expect(await t.mutation(internal.dreamCandidates.purgeInternal, {})).toBe(
      3,
    );
    expect((await candidates(t)).map((row) => row._id)).toEqual([kept]);
  });
});
