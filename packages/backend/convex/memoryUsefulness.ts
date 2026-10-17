import { v } from "convex/values";
import {
  readTypesafeApiKey,
  scoreMemoryUsefulness,
} from "../engine/llm/typesafeSystemOne";
import { jevEligible, jevPriority } from "../engine/memory/usefulness";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  legacyHitsOf,
  usefulnessOfDoc,
  type UsageHits,
} from "./memoryStore/mappers";
import { deleteMemoryUsage, findUsageRow } from "./memoryStore/usage";
import { memoryAccessKindValidator } from "./validators";

type AccessKind = "retrieve" | "search" | "contextPack";

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

const MAX_IDS_PER_ENQUEUE = 50;
// Each flushed memory costs about 6 reads and 3 writes; stays far under the
// Convex per-mutation limits.
const FLUSH_BATCH = 400;
const BACKFILL_BATCH = 100;
const JEV_BATCH = 8;
// Rows read per priority tier, so skipped low-prior rows cannot hide others
const JEV_SCAN = 50;
const JEV_MAX_ATTEMPTS = 3;
// Wait before retry after failure 1 and 2. Failure 3 gives up.
const JEV_BACKOFF_MS = [60 * MS_PER_MINUTE, 6 * 60 * MS_PER_MINUTE];
const JEV_TIERS = [0, 1, 2];
// Score is written to the memory row only for a real change, at most daily
const SCORE_WRITE_MIN_DELTA = 0.05;
const SCORE_WRITE_MIN_INTERVAL_MS = MS_PER_DAY;

/**
 * Queue access hits for a batched flush. Call after an explicit retrieve,
 * context pack or result open. Never call for typeahead. Never patches memory
 * rows. Fail-open: access tracking must not break a read path.
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

// One pending row per memory and kind: later hits raise `count`.
export const enqueueAccess = internalMutation({
  args: {
    ids: v.array(v.string()),
    kind: memoryAccessKindValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const createdAt = Date.now();
    for (const memoryId of new Set(args.ids)) {
      const existing = await ctx.db
        .query("memoryAccessPending")
        .withIndex("by_memory_kind", (q) =>
          q.eq("memoryId", memoryId).eq("kind", args.kind),
        )
        .first();
      if (existing === null) {
        await ctx.db.insert("memoryAccessPending", {
          memoryId,
          kind: args.kind,
          createdAt,
          count: 1,
        });
      } else {
        await ctx.db.patch(existing._id, {
          count: (existing.count ?? 1) + 1,
        });
      }
    }
    return null;
  },
});

// Folds pending rows into memoryUsage, one write per memory per run (every
// pending row of a page's memories is folded, not only the page's rows), then
// rescores the heuristic (never Jev). The memory row is patched only when the
// score moved by SCORE_WRITE_MIN_DELTA and the last score write is at least a
// day old. Reschedules itself while pages come back full.
// Run by cron "flush memory access"; manual: npx convex run memoryUsefulness:flushAccessPending
export const flushAccessPending = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const page = await ctx.db
      .query("memoryAccessPending")
      .withIndex("by_created")
      .take(FLUSH_BATCH);
    const now = Date.now();
    for (const memoryId of new Set(page.map((row) => row.memoryId))) {
      const rows = await ctx.db
        .query("memoryAccessPending")
        .withIndex("by_memory_kind", (q) => q.eq("memoryId", memoryId))
        .collect();
      const doc = await ctx.db
        .query("memories")
        .withIndex("by_memory_id", (q) => q.eq("memoryId", memoryId))
        .unique();
      if (doc === null) {
        await deleteMemoryUsage(ctx, memoryId); // memory deleted
        continue;
      }
      const usage = await findUsageRow(ctx, memoryId);
      const base = usage ?? { ...legacyHitsOf(doc) };
      const hits = {
        retrieveHits: base.retrieveHits ?? 0,
        searchHits: base.searchHits ?? 0,
        contextPackHits: base.contextPackHits ?? 0,
      };
      for (const row of rows) {
        const count = row.count ?? 1;
        if (row.kind === "retrieve") hits.retrieveHits += count;
        else if (row.kind === "search") hits.searchHits += count;
        else hits.contextPackHits += count;
        await ctx.db.delete(row._id);
      }
      if (usage === null) {
        await ctx.db.insert("memoryUsage", {
          memoryId,
          ...hits,
          lastAccessedAt: now,
        });
      } else {
        await ctx.db.patch(usage._id, { ...hits, lastAccessedAt: now });
      }
      await patchScoreIfMoved(ctx, doc, hits, now);
    }
    if (page.length === FLUSH_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.memoryUsefulness.flushAccessPending,
        {},
      );
    }
    return null;
  },
});

async function patchScoreIfMoved(
  ctx: MutationCtx,
  doc: Doc<"memories">,
  hits: UsageHits,
  now: number,
): Promise<void> {
  const next = usefulnessOfDoc(doc, now, hits);
  const old = doc.usefulnessScore;
  const lastWrite = doc.usefulnessScoredAt;
  const intervalPassed =
    lastWrite === undefined || now - lastWrite >= SCORE_WRITE_MIN_INTERVAL_MS;
  const moved =
    old === undefined || Math.abs(next - old) >= SCORE_WRITE_MIN_DELTA;
  if (!intervalPassed || !moved) return;
  await ctx.db.patch(doc._id, {
    usefulnessScore: next,
    usefulnessScoredAt: now,
  });
}

// Copies legacy hit counters from memory rows into memoryUsage (skips rows that
// already have one). Run once after deploy; chains itself until done.
// Operators: npx convex run memoryUsefulness:backfillMemoryUsage '{}'
// (pass {"cursor": "..."} to resume). Run before any flush, then run
// backfillUsefulnessHeuristics again so Jev rows get a priority.
export const backfillMemoryUsage = internalMutation({
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
    for (const doc of page.page) {
      const legacy = legacyHitsOf(doc);
      if (
        legacy.retrieveHits === undefined &&
        legacy.searchHits === undefined &&
        legacy.contextPackHits === undefined
      ) {
        continue;
      }
      if ((await findUsageRow(ctx, doc.memoryId)) !== null) continue;
      await ctx.db.insert("memoryUsage", {
        memoryId: doc.memoryId,
        retrieveHits: legacy.retrieveHits ?? 0,
        searchHits: legacy.searchHits ?? 0,
        contextPackHits: legacy.contextPackHits ?? 0,
        lastAccessedAt: doc.usefulnessScoredAt ?? doc._creationTime,
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.memoryUsefulness.backfillMemoryUsage,
        { cursor: page.continueCursor, batchSize: args.batchSize },
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
  const hits = (await findUsageRow(ctx, doc.memoryId)) ?? legacyHitsOf(doc);
  await ctx.db.patch(doc._id, {
    usefulnessScore: usefulnessOfDoc(doc, now, hits),
    usefulnessScoredAt: now,
    ...(jevEligible(doc.source, doc.sourceType)
      ? {
          // queue for Jev; all index fields must exist or the row is not indexed
          usefulnessNeedsJev: true,
          usefulnessJevPriority: jevPriority(
            doc.source,
            doc.sourceType,
            "backfill",
          ),
          usefulnessJevAt: doc.usefulnessJevAt ?? 0,
        }
      : {}),
  });
}

// Fixes an already flagged row: low-prior sources leave the Jev queue, others
// get the priority the by_needs_jev index needs.
async function repairJevFlag(
  ctx: MutationCtx,
  doc: Doc<"memories">,
): Promise<void> {
  if (!jevEligible(doc.source, doc.sourceType)) {
    await ctx.db.patch(doc._id, { usefulnessNeedsJev: false });
  } else if (doc.usefulnessJevPriority === undefined) {
    await ctx.db.patch(doc._id, {
      usefulnessJevPriority: jevPriority(
        doc.source,
        doc.sourceType,
        "backfill",
      ),
      usefulnessJevAt: doc.usefulnessJevAt ?? 0,
    });
  }
}

// Heuristic only (no Jev call; queues eligible rows for the Jev cron). Rows
// that already have a score are only repaired (see repairJevFlag). Pages the
// whole table by creation time and chains itself until done.
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
      if (doc.usefulnessScore === undefined) {
        await writeHeuristicAndQueueJev(ctx, doc, now);
      } else if (doc.usefulnessNeedsJev === true) {
        await repairJevFlag(ctx, doc);
      }
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

// Due rows (usefulnessJevAt in the past, so failed rows wait out their
// backoff), best tier first. Low-prior sources are skipped even when flagged.
async function pickJevCandidates(
  ctx: Pick<QueryCtx, "db">,
  limit: number,
  now: number,
): Promise<Doc<"memories">[]> {
  const picked: Doc<"memories">[] = [];
  for (const tier of JEV_TIERS) {
    if (picked.length >= limit) break;
    const rows = await ctx.db
      .query("memories")
      .withIndex("by_needs_jev", (q) =>
        q
          .eq("usefulnessNeedsJev", true)
          .eq("usefulnessJevPriority", tier)
          .lte("usefulnessJevAt", now),
      )
      .take(JEV_SCAN);
    for (const doc of rows) {
      if (picked.length >= limit) break;
      if (jevEligible(doc.source, doc.sourceType)) picked.push(doc);
    }
  }
  return picked;
}

export const listJevCandidates = internalQuery({
  args: { limit: v.number() },
  returns: v.array(jevCandidateValidator),
  handler: async (ctx, args) => {
    const docs = await pickJevCandidates(
      ctx,
      Math.min(Math.max(1, args.limit), JEV_BATCH),
      Date.now(),
    );
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

// Writes one Jev result. Without `quality` the call failed: the attempt counts,
// the row waits out a backoff (usefulnessJevAt in the future), and after
// JEV_MAX_ATTEMPTS it leaves the queue with the heuristic score.
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
    if (doc.contentHash !== args.contentHash) {
      // content changed while scoring: not a failure, retry on the new content
      await ctx.db.patch(doc._id, { usefulnessJevAt: now });
      return null;
    }
    if (args.quality === undefined) {
      const attempts = (doc.usefulnessJevAttempts ?? 0) + 1;
      if (attempts >= JEV_MAX_ATTEMPTS) {
        await ctx.db.patch(doc._id, {
          usefulnessJevAttempts: attempts,
          usefulnessJevAt: now,
          usefulnessNeedsJev: false,
        });
        return null;
      }
      await ctx.db.patch(doc._id, {
        usefulnessJevAttempts: attempts,
        usefulnessJevAt: now + (JEV_BACKOFF_MS[attempts - 1] ?? 0),
      });
      return null;
    }
    const hits = (await findUsageRow(ctx, doc.memoryId)) ?? legacyHitsOf(doc);
    const next = { ...doc, usefulnessJevScore: args.quality };
    await ctx.db.patch(doc._id, {
      usefulnessJevScore: args.quality,
      usefulnessJevAt: now,
      usefulnessJevAttempts: 0,
      usefulnessContentHash: args.contentHash,
      usefulnessNeedsJev: false,
      usefulnessScore: usefulnessOfDoc(next, now, hits),
      usefulnessScoredAt: now,
    });
    return null;
  },
});

// Cron entry. Schedules the action only when a key exists and a row is due.
export const kickJevQuality = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (readTypesafeApiKey() === undefined) return null;
    const due = await pickJevCandidates(ctx, 1, Date.now());
    if (due.length === 0) return null;
    await ctx.scheduler.runAfter(
      0,
      internal.memoryUsefulness.runJevQualityBatch,
      {},
    );
    return null;
  },
});

// Stops the run at once on a missing key or a 401/403 (a bad key fails every
// row, so do not touch the rest). Per-row failures go to applyJevQuality.
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
      const result = await scoreMemoryUsefulness({
        apiKey,
        memory: {
          title: candidate.title,
          content: candidate.content,
          source: candidate.source,
          sourceType: candidate.sourceType,
          tags: candidate.tags,
        },
      });
      if (result.status === "auth_error" || result.status === "skipped") {
        console.warn(
          `[usefulness] Jev batch stopped: ${result.status}${
            result.status === "auth_error"
              ? ` (HTTP ${String(result.httpStatus)})`
              : ""
          }`,
        );
        break;
      }
      await ctx.runMutation(internal.memoryUsefulness.applyJevQuality, {
        memoryId: candidate.memoryId,
        contentHash: candidate.contentHash,
        quality: result.status === "ok" ? result.quality : undefined,
      });
    }
    return null;
  },
});
