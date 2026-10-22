import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  applyStatDeltas,
  loadStatsMeta,
  readMemoryStats,
  statDeltasForDocs,
} from "./memoryStore/stats";
import { memoryReadScopeFromArgs } from "./memoryStore/helpers";
import { memoryStatusValidator } from "./validators";

const BACKFILL_BATCH = 50;
const RESET_BATCH = 200;
const AUDIT_PAGE = 100;

const dashboardStatsValidator = v.object({
  totalMemories: v.number(),
  memoriesThisWeek: v.number(),
  memoriesThisMonth: v.number(),
  memoriesAddedToday: v.number(),
  totalTags: v.number(),
  growthData: v.array(
    v.object({ isoDate: v.string(), total: v.number(), new: v.number() }),
  ),
});

export const getMemoryStatsInternal = internalQuery({
  args: {
    kind: v.union(v.literal("personal"), v.literal("team")),
    userId: v.optional(v.string()),
    profileId: v.optional(v.string()),
    now: v.number(),
  },
  returns: v.union(dashboardStatsValidator, v.null()),
  handler: async (ctx, args) => {
    const scope = memoryReadScopeFromArgs(args);
    if (scope === null) return null;
    return await readMemoryStats(ctx, scope, args.now);
  },
});

export const memoryStatsStatusInternal = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      trackingSince: v.number(),
      backfilledThrough: v.number(),
      ready: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const meta = await loadStatsMeta(ctx);
    if (meta === null) return null;
    return {
      trackingSince: meta.trackingSince,
      backfilledThrough: meta.backfilledThrough,
      ready: meta.ready,
    };
  },
});

// ONE-OFF, additive: starts live counter tracking and backfills existing
// memories in bounded pages. Run `verifyMemoryStatsInternal` with
// {"dryRun":true} first to preview, and again afterwards to compare.
//   npx convex run memoryStats:startMemoryStatsBackfillInternal '{}'
export const startMemoryStatsBackfillInternal = internalMutation({
  args: {},
  returns: v.object({ started: v.boolean() }),
  handler: async (ctx) => {
    const meta = await loadStatsMeta(ctx);
    if (meta !== null) return { started: false };
    await ctx.db.insert("memoryStatsMeta", {
      trackingSince: Date.now(),
      backfilledThrough: 0,
      ready: false,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.memoryStats.backfillMemoryStatsStepInternal,
      {},
    );
    return { started: true };
  },
});

export const backfillMemoryStatsStepInternal = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ counted: v.number(), ready: v.boolean() }),
  handler: async (ctx, args) => {
    const meta = await loadStatsMeta(ctx);
    if (meta === null || meta.ready) return { counted: 0, ready: true };
    const size = Math.max(1, Math.min(args.batchSize ?? BACKFILL_BATCH, 100));
    const docs = await ctx.db
      .query("memories")
      .withIndex("by_creation_time", (q) =>
        q
          .gt("_creationTime", meta.backfilledThrough)
          .lte("_creationTime", meta.trackingSince),
      )
      .take(size);
    await applyStatDeltas(ctx, statDeltasForDocs(docs));
    const last = docs[docs.length - 1];
    const ready = docs.length < size;
    await ctx.db.patch(meta._id, {
      backfilledThrough:
        last === undefined ? meta.backfilledThrough : last._creationTime,
      ready,
    });
    if (!ready) {
      await ctx.scheduler.runAfter(
        0,
        internal.memoryStats.backfillMemoryStatsStepInternal,
        { batchSize: size },
      );
    }
    return { counted: docs.length, ready };
  },
});

// Wipes the counters and meta so the backfill can be started again from
// scratch. Reads fall back to the row walk while meta is absent.
export const resetMemoryStatsInternal = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async (ctx) => {
    const meta = await loadStatsMeta(ctx);
    if (meta !== null) await ctx.db.delete(meta._id);
    const rows = await ctx.db.query("memoryStatCounters").take(RESET_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    const done = rows.length < RESET_BATCH;
    if (!done) {
      await ctx.scheduler.runAfter(
        0,
        internal.memoryStats.resetMemoryStatsInternal,
        {},
      );
    }
    return { deleted: rows.length, done };
  },
});

export const statsAuditPageInternal = internalQuery({
  args: { after: v.number() },
  returns: v.array(
    v.object({
      _creationTime: v.number(),
      memoryId: v.string(),
      userId: v.string(),
      profileId: v.optional(v.string()),
      createdAt: v.number(),
      tags: v.array(v.string()),
      status: memoryStatusValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("memories")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", args.after))
      .take(AUDIT_PAGE);
    return docs.map((doc) => ({
      _creationTime: doc._creationTime,
      memoryId: doc.memoryId,
      userId: doc.userId,
      profileId: doc.profileId,
      createdAt: doc.createdAt,
      tags: doc.tags,
      status: doc.status,
    }));
  },
});

export const statsCounterPageInternal = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    rows: v.array(
      v.object({
        userId: v.string(),
        profileId: v.optional(v.string()),
        kind: v.string(),
        key: v.string(),
        count: v.number(),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("memoryStatCounters")
      .paginate({ cursor: args.cursor, numItems: 500 });
    return {
      rows: page.page.map((row) => ({
        userId: row.userId,
        profileId: row.profileId,
        kind: row.kind,
        key: row.key,
        count: row.count,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

function bucketKey(parts: {
  userId: string;
  profileId?: string;
  kind: string;
  key: string;
}): string {
  return JSON.stringify([
    parts.userId,
    parts.profileId ?? null,
    parts.kind,
    parts.key,
  ]);
}

// Recounts every memory from the rows and, unless dryRun, compares that with
// the stored counters. Read-only; mismatches caused by writes that land while
// it runs show up as small diffs, so re-run before trusting a diff.
export const verifyMemoryStatsInternal = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    memories: v.number(),
    expectedRows: v.number(),
    storedRows: v.number(),
    mismatches: v.number(),
    sample: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const expected = new Map<string, number>();
    let memories = 0;
    let after = 0;
    for (;;) {
      const docs = await ctx.runQuery(
        internal.memoryStats.statsAuditPageInternal,
        { after },
      );
      if (docs.length === 0) break;
      memories += docs.length;
      for (const { ref, delta } of statDeltasForDocs(docs).values()) {
        const key = bucketKey(ref);
        expected.set(key, (expected.get(key) ?? 0) + delta);
      }
      const last = docs[docs.length - 1];
      if (last === undefined) break;
      after = last._creationTime;
    }
    if (args.dryRun === true) {
      return {
        memories,
        expectedRows: expected.size,
        storedRows: 0,
        mismatches: 0,
        sample: [],
      };
    }
    const stored = new Map<string, number>();
    let cursor: string | null = null;
    for (;;) {
      const page: {
        rows: Array<{
          userId: string;
          profileId?: string;
          kind: string;
          key: string;
          count: number;
        }>;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.memoryStats.statsCounterPageInternal, {
        cursor,
      });
      for (const row of page.rows) {
        const key = bucketKey(row);
        stored.set(key, (stored.get(key) ?? 0) + row.count);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    const sample: string[] = [];
    let mismatches = 0;
    for (const key of new Set([...expected.keys(), ...stored.keys()])) {
      const want = expected.get(key) ?? 0;
      const have = stored.get(key) ?? 0;
      if (want === have) continue;
      mismatches += 1;
      if (sample.length < 10) {
        sample.push(`${key} expected=${String(want)} stored=${String(have)}`);
      }
    }
    return {
      memories,
      expectedRows: expected.size,
      storedRows: stored.size,
      mismatches,
      sample,
    };
  },
});
