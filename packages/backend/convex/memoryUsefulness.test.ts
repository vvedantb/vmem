/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const base = {
  userId: "clerk_user_a",
  profileId: "profile_a",
  title: "Visited docs",
  content: "Read the pnpm docs",
  type: "knowledge" as const,
  source: "bookmarks",
  tags: [],
  confidence: 0.9,
};

describe("memory usefulness", () => {
  it("scores on create, flags Jev, and counts edits on update", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      { ...base, memoryId: "m1" },
    );
    expect(created.usefulness?.score).toBeGreaterThan(0);
    const row = await t.run((ctx) =>
      ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", "m1"))
        .unique(),
    );
    expect(row?.usefulnessNeedsJev).toBe(true);
    expect(row?.usefulnessJevAt).toBe(0);
    const candidates = await t.query(
      internal.memoryUsefulness.listJevCandidates,
      { limit: 8 },
    );
    expect(candidates.map((c) => c.memoryId)).toEqual(["m1"]);
    const before = row?.usefulnessScore ?? 0;
    await t.mutation(internal.memoryStore.functions.updateMemoryInternal, {
      userId: base.userId,
      memoryId: "m1",
      content: "Read the pnpm docs twice",
    });
    const after = await t.run((ctx) =>
      ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", "m1"))
        .unique(),
    );
    expect(after?.usefulnessEditCount).toBe(1);
    expect(after?.usefulnessScore).toBeGreaterThanOrEqual(before);
  });

  it("flushes pending hits into counters and drops missing memories", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...base,
      memoryId: "m1",
    });
    await t.mutation(internal.memoryUsefulness.enqueueAccess, {
      ids: ["m1", "gone"],
      kind: "retrieve",
    });
    await t.mutation(internal.memoryUsefulness.enqueueAccess, {
      ids: ["m1"],
      kind: "contextPack",
    });
    await t.mutation(internal.memoryUsefulness.flushAccessPending, {});
    const { row, pending } = await t.run(async (ctx) => ({
      row: await ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", "m1"))
        .unique(),
      pending: await ctx.db.query("memoryAccessPending").collect(),
    }));
    expect(row?.usefulnessRetrieveHits).toBe(1);
    expect(row?.usefulnessContextPackHits).toBe(1);
    expect(pending).toHaveLength(0);
  });

  it("backfills missing scores and queues Jev without calling it", async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert("memories", {
        memoryId: "old",
        ...base,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
        contentHash: "h",
        visitCount: 1,
        firstVisitAt: 1,
        lastVisitAt: 1,
      }),
    );
    await t.mutation(
      internal.memoryUsefulness.backfillUsefulnessHeuristics,
      {},
    );
    const row = await t.run((ctx) =>
      ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", "old"))
        .unique(),
    );
    expect(row?.usefulnessScore).toBeGreaterThan(0);
    expect(row?.usefulnessNeedsJev).toBe(true);
    expect(row?.usefulnessJevAt).toBe(0);
    expect(row?.usefulnessJevScore).toBeUndefined();
    const candidates = await t.query(
      internal.memoryUsefulness.listJevCandidates,
      { limit: 8 },
    );
    expect(candidates.map((c) => c.memoryId)).toEqual(["old"]);
  });

  it("applies Jev quality only when the content hash still matches", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...base,
      memoryId: "m1",
      contentHash: "h1",
    });
    await t.mutation(internal.memoryUsefulness.applyJevQuality, {
      memoryId: "m1",
      contentHash: "stale",
      quality: 1,
    });
    const candidates = await t.query(
      internal.memoryUsefulness.listJevCandidates,
      {
        limit: 8,
      },
    );
    expect(candidates.map((c) => c.memoryId)).toEqual(["m1"]);
    await t.mutation(internal.memoryUsefulness.applyJevQuality, {
      memoryId: "m1",
      contentHash: "h1",
      quality: 1,
    });
    expect(
      await t.query(internal.memoryUsefulness.listJevCandidates, { limit: 8 }),
    ).toEqual([]);
  });
});
