import { v } from "convex/values";
import {
  readTypesafeApiKey,
  scoreMemoryUsefulness,
} from "../engine/llm/typesafeSystemOne";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { usefulnessOfDoc } from "./memoryStore/mappers";
import { memoryAccessKindValidator } from "./validators";

type AccessKind = "retrieve" | "search" | "contextPack";

const MAX_IDS_PER_ENQUEUE = 50;
const FLUSH_BATCH = 50;
const BACKFILL_BATCH = 100;
const JEV_BATCH = 8;

/**
 * Queue access hits for a batched flush. Call after retrieve, search or
 * context pack. Never patches memory rows. Fail-open: access tracking must not
 * break a read path.
 */
export async function enqueueMemoryAccess(
  ctx: Pick<ActionCtx, "scheduler">,
  ids: readonly string[],
  kind: AccessKind,
): Promise<void> {
  const unique = [...new Set(ids)].slice(0, MAX_IDS_PER_ENQUEUE);
  if (unique.length === 0) return;
  try {
    await ctx.scheduler.runAfter(0, internal.memoryUsefulness.enqueueAccess, {
      ids: unique,
      kind,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[usefulness] enqueue failed:", message);
  }
}

export const enqueueAccess = internalMutation({
  args: {
    ids: v.array(v.string()),
    kind: memoryAccessKindValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const createdAt = Date.now();
    for (const memoryId of new Set(args.ids)) {
      await ctx.db.insert("memoryAccessPending", {
        memoryId,
        kind: args.kind,
        createdAt,
      });
    }
    return null;
  },
});

type Counters = Pick<
  Doc<"memories">,
  | "usefulnessRetrieveHits"
  | "usefulnessSearchHits"
  | "usefulnessContextPackHits"
>;

// Fold one batch of pending rows into memory counters, then rescore the
// heuristic (never Jev). Reschedules itself while batches come back full.
// Run by cron "flush memory access"; manual: npx convex run memoryUsefulness:flushAccessPending
export const flushAccessPending = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("memoryAccessPending")
      .withIndex("by_created")
      .take(FLUSH_BATCH);
    const byMemory = new Map<string, Counters>();
    for (const row of pending) {
      const counters = byMemory.get(row.memoryId) ?? {};
      if (row.kind === "retrieve") {
        counters.usefulnessRetrieveHits =
          (counters.usefulnessRetrieveHits ?? 0) + 1;
      } else if (row.kind === "search") {
        counters.usefulnessSearchHits =
          (counters.usefulnessSearchHits ?? 0) + 1;
      } else {
        counters.usefulnessContextPackHits =
          (counters.usefulnessContextPackHits ?? 0) + 1;
      }
      byMemory.set(row.memoryId, counters);
    }
    const now = Date.now();
    for (const [memoryId, added] of byMemory) {
      const doc = await ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", memoryId))
        .unique();
      if (doc === null) continue; // memory deleted: drop its pending rows
      const next = {
        usefulnessRetrieveHits:
          (doc.usefulnessRetrieveHits ?? 0) +
          (added.usefulnessRetrieveHits ?? 0),
        usefulnessSearchHits:
          (doc.usefulnessSearchHits ?? 0) + (added.usefulnessSearchHits ?? 0),
        usefulnessContextPackHits:
          (doc.usefulnessContextPackHits ?? 0) +
          (added.usefulnessContextPackHits ?? 0),
      };
      await ctx.db.patch(doc._id, {
        ...next,
        usefulnessScore: usefulnessOfDoc({ ...doc, ...next }, now),
        usefulnessScoredAt: now,
      });
    }
    for (const row of pending) await ctx.db.delete(row._id);
    if (pending.length === FLUSH_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.memoryUsefulness.flushAccessPending,
        {},
      );
    }
    return null;
  },
});

async function writeHeuristicAndQueueJev(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  now: number,
): Promise<void> {
  await ctx.db.patch(doc._id, {
    usefulnessScore: usefulnessOfDoc(doc, now),
    usefulnessScoredAt: now,
    // queue for Jev; both index fields must exist or the row is not indexed
    usefulnessNeedsJev: true,
    usefulnessJevAt: doc.usefulnessJevAt ?? 0,
  });
}

// Heuristic only (no Jev call; queues the row for the Jev cron). Pages the whole table by creation time and chains
// itself until done.
// Operators: npx convex run memoryUsefulness:backfillUsefulnessHeuristics '{}'
// (internal.memoryUsefulness.backfillUsefulnessHeuristics; pass {"cursor": "..."} to resume)
export const backfillUsefulnessHeuristics = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("memories").paginate({
      numItems: Math.min(Math.max(1, args.batchSize ?? BACKFILL_BATCH), 200),
      cursor: args.cursor ?? null,
    });
    const now = Date.now();
    for (const doc of page.page) {
      if (doc.usefulnessScore === undefined)
        await writeHeuristicAndQueueJev(ctx, doc, now);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.memoryUsefulness.backfillUsefulnessHeuristics,
        { cursor: page.continueCursor, batchSize: args.batchSize },
      );
    }
    return null;
  },
});

// ── Jev quality (TypeSafe HTTP, cron only) ──────────────────────────────────

const jevCandidateValidator = v.object({
  memoryId: v.string(),
  title: v.string(),
  content: v.string(),
  source: v.string(),
  sourceType: v.optional(v.string()),
  tags: v.array(v.string()),
  contentHash: v.string(),
});

export const listJevCandidates = internalQuery({
  args: { limit: v.number() },
  returns: v.array(jevCandidateValidator),
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("memories")
      .withIndex("by_needs_jev", (q) => q.eq("usefulnessNeedsJev", true))
      .take(Math.min(Math.max(1, args.limit), JEV_BATCH));
    return docs.map((doc) => ({
      memoryId: doc.memoryId,
      title: doc.title,
      content: doc.content,
      source: doc.source,
      sourceType: doc.sourceType,
      tags: doc.tags,
      contentHash: doc.contentHash,
    }));
  },
});

// Writes one Jev result. Without `quality` it only stamps the attempt, which
// moves the row to the back of the queue so one bad memory cannot block it.
export const applyJevQuality = internalMutation({
  args: {
    memoryId: v.string(),
    contentHash: v.string(),
    quality: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("memories")
      .withIndex("by_memory_id", (q) => q.eq("memoryId", args.memoryId))
      .unique();
    if (doc === null) return null;
    const now = Date.now();
    if (args.quality === undefined || doc.contentHash !== args.contentHash) {
      // failed, or content changed while scoring: stays flagged for a retry
      await ctx.db.patch(doc._id, { usefulnessJevAt: now });
      return null;
    }
    const next = { ...doc, usefulnessJevScore: args.quality };
    await ctx.db.patch(doc._id, {
      usefulnessJevScore: args.quality,
      usefulnessJevAt: now,
      usefulnessContentHash: args.contentHash,
      usefulnessNeedsJev: false,
      usefulnessScore: usefulnessOfDoc(next, now),
      usefulnessScoredAt: now,
    });
    return null;
  },
});

// Cron entry. A mutation cannot read the TypeSafe key, so it only checks the
// index and schedules the action, which skips when the key is missing.
export const kickJevQuality = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const next = await ctx.db
      .query("memories")
      .withIndex("by_needs_jev", (q) => q.eq("usefulnessNeedsJev", true))
      .first();
    if (next === null) return null;
    await ctx.scheduler.runAfter(
      0,
      internal.memoryUsefulness.runJevQualityBatch,
      {},
    );
    return null;
  },
});

export const runJevQualityBatch = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const apiKey = readTypesafeApiKey();
    if (apiKey === undefined) return null;
    const candidates = await ctx.runQuery(
      internal.memoryUsefulness.listJevCandidates,
      { limit: JEV_BATCH },
    );
    for (const candidate of candidates) {
      const quality = await scoreMemoryUsefulness({
        apiKey,
        memory: {
          title: candidate.title,
          content: candidate.content,
          source: candidate.source,
          sourceType: candidate.sourceType,
          tags: candidate.tags,
        },
      });
      await ctx.runMutation(internal.memoryUsefulness.applyJevQuality, {
        memoryId: candidate.memoryId,
        contentHash: candidate.contentHash,
        quality,
      });
    }
    return null;
  },
});
