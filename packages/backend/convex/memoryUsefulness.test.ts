/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { deleteMemory } from "./memoryStore/helpers";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type TestDb = Pick<MutationCtx, "db">;

function rowOf(ctx: TestDb, memoryId: string) {
  return ctx.db
    .query("memories")
    .withIndex("by_memory_id", (q) => q.eq("memoryId", memoryId))
    .unique();
}

const base = {
  userId: "clerk_user_a",
  profileId: "profile_a",
  title: "Visited docs",
  content: "Read the pnpm docs",
  type: "knowledge" as const,
  source: "mcp",
  tags: [],
  confidence: 0.9,
};
// rows reuse one body on purpose; hash dedupe has its own tests
const seedBase = { ...base, skipHashDedupe: true };

describe("memory usefulness", () => {
  it("scores on create, flags Jev, and counts edits on update", async () => {
    const t = convexTest(schema, modules);
    const created = await t.mutation(
      internal.memoryStore.functions.createMemoryInternal,
      { ...seedBase, memoryId: "m1" },
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

  it("flushes hits into memoryUsage, not onto the memory row", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...seedBase,
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
    const { row, usage, pending } = await t.run(async (ctx) => ({
      row: await rowOf(ctx, "m1"),
      usage: await ctx.db.query("memoryUsage").collect(),
      pending: await ctx.db.query("memoryAccessPending").collect(),
    }));
    expect(usage).toHaveLength(1);
    expect(usage[0]?.memoryId).toBe("m1");
    expect(usage[0]?.retrieveHits).toBe(1);
    expect(usage[0]?.contextPackHits).toBe(1);
    expect(row?.usefulnessRetrieveHits).toBeUndefined();
    expect(row?.usefulnessContextPackHits).toBeUndefined();
    expect(pending).toHaveLength(0);
  });

  it("keeps one pending row per memory and kind and folds it once", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...seedBase,
      memoryId: "m1",
    });
    for (let i = 0; i < 3; i += 1) {
      await t.mutation(internal.memoryUsefulness.enqueueAccess, {
        ids: ["m1"],
        kind: "retrieve",
      });
    }
    // legacy duplicate rows from before the upsert
    await t.run(async (ctx) => {
      for (let i = 0; i < 2; i += 1) {
        await ctx.db.insert("memoryAccessPending", {
          memoryId: "m1",
          kind: "retrieve",
          createdAt: 1,
        });
      }
    });
    expect(
      await t.run((ctx) => ctx.db.query("memoryAccessPending").collect()),
    ).toHaveLength(3);
    await t.mutation(internal.memoryUsefulness.flushAccessPending, {});
    const usage = await t.run((ctx) => ctx.db.query("memoryUsage").collect());
    expect(usage).toHaveLength(1);
    expect(usage[0]?.retrieveHits).toBe(5);
    expect(
      await t.run((ctx) => ctx.db.query("memoryAccessPending").collect()),
    ).toHaveLength(0);
  });

  it("writes the score to the memory only for a real, non-recent change", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...seedBase,
      memoryId: "m1",
    });
    const flushOne = async () => {
      await t.mutation(internal.memoryUsefulness.enqueueAccess, {
        ids: ["m1"],
        kind: "retrieve",
      });
      await t.mutation(internal.memoryUsefulness.flushAccessPending, {});
    };
    const before = await t.run((ctx) => rowOf(ctx, "m1"));
    // scored just now: usage moves, the row score does not
    await flushOne();
    const recent = await t.run((ctx) => rowOf(ctx, "m1"));
    expect(recent?.usefulnessScore).toBe(before?.usefulnessScore);
    expect(recent?.usefulnessScoredAt).toBe(before?.usefulnessScoredAt);
    // last write two days ago but a tiny score move: still no write
    const twoDaysAgo = Date.now() - 2 * 86_400_000;
    await t.run(async (ctx) => {
      const row = await rowOf(ctx, "m1");
      // 0.6 is within 0.05 of the score after the next hit (about 0.61)
      if (row)
        await ctx.db.patch(row._id, {
          usefulnessScoredAt: twoDaysAgo,
          usefulnessScore: 0.6,
        });
    });
    await flushOne();
    const small = await t.run((ctx) => rowOf(ctx, "m1"));
    expect(small?.usefulnessScoredAt).toBe(twoDaysAgo);
    expect(small?.usefulnessScore).toBe(0.6);
    // old score far from the new one and old write: patched
    await t.run(async (ctx) => {
      const row = await rowOf(ctx, "m1");
      if (row) await ctx.db.patch(row._id, { usefulnessScore: 0 });
    });
    await flushOne();
    const moved = await t.run((ctx) => rowOf(ctx, "m1"));
    expect(moved?.usefulnessScore).toBeGreaterThan(0.05);
    expect(moved?.usefulnessScoredAt).toBeGreaterThan(twoDaysAgo);
  });

  it("deletes usage and pending rows with the memory", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...seedBase,
      memoryId: "m1",
    });
    await t.mutation(internal.memoryUsefulness.enqueueAccess, {
      ids: ["m1"],
      kind: "retrieve",
    });
    await t.mutation(internal.memoryUsefulness.flushAccessPending, {});
    await t.mutation(internal.memoryUsefulness.enqueueAccess, {
      ids: ["m1"],
      kind: "retrieve",
    });
    await t.run((ctx) => deleteMemory(ctx, base.userId, "m1"));
    const left = await t.run(async (ctx) => ({
      usage: await ctx.db.query("memoryUsage").collect(),
      pending: await ctx.db.query("memoryAccessPending").collect(),
    }));
    expect(left.usage).toHaveLength(0);
    expect(left.pending).toHaveLength(0);
  });

  it("backfills memoryUsage from legacy hit fields once", async () => {
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
        usefulnessRetrieveHits: 4,
        usefulnessContextPackHits: 2,
      }),
    );
    for (let i = 0; i < 2; i += 1) {
      await t.mutation(internal.memoryUsefulness.backfillMemoryUsage, {});
    }
    const usage = await t.run((ctx) => ctx.db.query("memoryUsage").collect());
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      memoryId: "old",
      retrieveHits: 4,
      searchHits: 0,
      contextPackHits: 2,
    });
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
      ...seedBase,
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

describe("Jev queue", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("never queues low-prior sources, even when flagged by an old backfill", async () => {
    const t = convexTest(schema, modules);
    for (const [memoryId, source] of [
      ["h", "browsing-history"],
      ["b", "bookmarks"],
      ["d", "desktop"],
    ] as const) {
      const created = await t.mutation(
        internal.memoryStore.functions.createMemoryInternal,
        { ...seedBase, memoryId, source },
      );
      expect(created.usefulness?.score).toBeGreaterThan(0);
    }
    const rows = await t.run((ctx) => ctx.db.query("memories").collect());
    expect(rows.every((r) => r.usefulnessNeedsJev === undefined)).toBe(true);
    // flagged by the first backfill version
    await t.run(async (ctx) => {
      for (const r of rows)
        await ctx.db.patch(r._id, {
          usefulnessNeedsJev: true,
          usefulnessJevPriority: 1,
          usefulnessJevAt: 0,
        });
    });
    expect(
      await t.query(internal.memoryUsefulness.listJevCandidates, { limit: 8 }),
    ).toEqual([]);
    await t.mutation(
      internal.memoryUsefulness.backfillUsefulnessHeuristics,
      {},
    );
    const after = await t.run((ctx) => ctx.db.query("memories").collect());
    expect(after.every((r) => r.usefulnessNeedsJev === false)).toBe(true);
  });

  it("lists high-prior sources before medium before backfill", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...seedBase,
      memoryId: "medium",
      source: "notion",
    });
    await t.run((ctx) =>
      ctx.db.insert("memories", {
        memoryId: "backfilled",
        ...base,
        source: "notion",
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
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...seedBase,
      memoryId: "high",
    });
    const ids = (
      await t.query(internal.memoryUsefulness.listJevCandidates, { limit: 8 })
    ).map((c) => c.memoryId);
    expect(ids).toEqual(["high", "medium", "backfilled"]);
  });

  it("backs off failures and gives up after three", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...seedBase,
      memoryId: "m1",
      contentHash: "h1",
    });
    const fail = () =>
      t.mutation(internal.memoryUsefulness.applyJevQuality, {
        memoryId: "m1",
        contentHash: "h1",
      });
    await fail();
    const first = await t.run((ctx) => rowOf(ctx, "m1"));
    expect(first?.usefulnessJevAttempts).toBe(1);
    expect(first?.usefulnessJevAt).toBeGreaterThan(Date.now());
    expect(first?.usefulnessNeedsJev).toBe(true);
    expect(
      await t.query(internal.memoryUsefulness.listJevCandidates, { limit: 8 }),
    ).toEqual([]);
    await fail();
    await fail();
    const last = await t.run((ctx) => rowOf(ctx, "m1"));
    expect(last?.usefulnessJevAttempts).toBe(3);
    expect(last?.usefulnessNeedsJev).toBe(false);
  });

  it("stops the whole batch on 401 and leaves rows untouched", async () => {
    const t = convexTest(schema, modules);
    for (const memoryId of ["m1", "m2", "m3"]) {
      await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
        ...seedBase,
        memoryId,
      });
    }
    vi.stubEnv("TYPESAFE_API_KEY", "bad");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.memoryUsefulness.runJevQualityBatch, {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rows = await t.run((ctx) => ctx.db.query("memories").collect());
    expect(rows.every((r) => r.usefulnessJevAttempts === undefined)).toBe(true);
    expect(rows.every((r) => r.usefulnessNeedsJev === true)).toBe(true);
  });

  it("counts a failed call as an attempt and continues with the next row", async () => {
    const t = convexTest(schema, modules);
    for (const memoryId of ["m1", "m2"]) {
      await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
        ...seedBase,
        memoryId,
      });
    }
    vi.stubEnv("TYPESAFE_API_KEY", "k");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.memoryUsefulness.runJevQualityBatch, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const rows = await t.run((ctx) => ctx.db.query("memories").collect());
    expect(rows.map((r) => r.usefulnessJevAttempts)).toEqual([1, 1]);
  });

  it("does not call TypeSafe or schedule work without a key", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memoryStore.functions.createMemoryInternal, {
      ...seedBase,
      memoryId: "m1",
    });
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    await t.mutation(internal.memoryUsefulness.kickJevQuality, {});
    await t.action(internal.memoryUsefulness.runJevQualityBatch, {});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
