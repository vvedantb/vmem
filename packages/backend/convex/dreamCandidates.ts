import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  CANDIDATE_NEIGHBOUR_LIMIT,
  CANDIDATE_RETENTION_MS,
  MAYBE_CONFLICT_MIN_SCORE,
  NEAR_DUP_MIN_SCORE,
  candidatePairKey,
  classifyCandidate,
} from "../engine/memory/dream/candidates";
import { isVisibleStatus } from "../engine/memory/scope";
import { isLowPriorSource } from "../engine/memory/usefulness";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { findByMemoryId } from "./memoryStore/helpers";

// Write-time dream candidates (plan §3a step 3). After a memory is embedded,
// its nearest vector neighbours in the same user + profile become
// dreamCandidates rows. No AI and no merge here: nightly dreaming judges them.
// Low-prior sources (browsing history, bookmarks, desktop) are skipped; the
// source-key dedupe covers them.

const PURGE_PAGE = 200;

// visible, and not a low-prior source
function isCandidateRow(doc: Doc<"memories">): boolean {
  return (
    isVisibleStatus(doc.status) && !isLowPriorSource(doc.source, doc.sourceType)
  );
}

export const candidateScopeInternal = internalQuery({
  args: { memoryId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      docId: v.id("memories"),
      userId: v.string(),
      profileId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await findByMemoryId(ctx, args.memoryId);
    if (!doc || !isCandidateRow(doc)) return null;
    return {
      docId: doc._id,
      userId: doc.userId,
      ...(doc.profileId === undefined ? {} : { profileId: doc.profileId }),
    };
  },
});

async function entityIdsOf(
  ctx: MutationCtx,
  memoryId: string,
): Promise<Set<Id<"memoryEntities">>> {
  const rows = await ctx.db
    .query("memoryEntityMentions")
    .withIndex("by_memory", (q) => q.eq("memoryId", memoryId))
    .collect();
  return new Set(rows.map((row) => row.entityId));
}

export const insertCandidatesInternal = internalMutation({
  args: {
    memoryDocId: v.id("memories"),
    hits: v.array(
      v.object({ embeddingId: v.id("memoryEmbeddings"), score: v.number() }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryDocId);
    if (!memory || !isCandidateRow(memory)) return 0;
    let own: Set<Id<"memoryEntities">> | undefined;
    let inserted = 0;
    let seen = 0;
    for (const hit of args.hits) {
      if (seen >= CANDIDATE_NEIGHBOUR_LIMIT) break;
      const embedding = await ctx.db.get(hit.embeddingId);
      if (!embedding || embedding.memoryDocId === memory._id) continue;
      seen += 1;
      const neighbor = await ctx.db.get(embedding.memoryDocId);
      if (
        !neighbor ||
        !isCandidateRow(neighbor) ||
        neighbor.userId !== memory.userId ||
        neighbor.profileId !== memory.profileId
      ) {
        continue;
      }
      // entity reads only for the conflict band
      let sharedEntity = false;
      if (hit.score < NEAR_DUP_MIN_SCORE) {
        own ??= await entityIdsOf(ctx, memory.memoryId);
        const mine = own;
        const theirs = await entityIdsOf(ctx, neighbor.memoryId);
        sharedEntity = [...theirs].some((id) => mine.has(id));
      }
      const kind = classifyCandidate({
        score: hit.score,
        sameType: neighbor.type === memory.type,
        sharedEntity,
      });
      if (kind === null) continue;
      const pairKey = candidatePairKey(memory._id, neighbor._id);
      const existing = await ctx.db
        .query("dreamCandidates")
        .withIndex("by_pair_key", (q) => q.eq("pairKey", pairKey))
        .first();
      if (existing) continue;
      await ctx.db.insert("dreamCandidates", {
        userId: memory.userId,
        ...(memory.profileId === undefined
          ? {}
          : { profileId: memory.profileId }),
        memoryId: memory._id,
        neighborId: neighbor._id,
        pairKey,
        score: hit.score,
        kind,
        status: "open",
        createdAt: Date.now(),
      });
      inserted += 1;
    }
    return inserted;
  },
});

/**
 * One vector query for a freshly embedded memory; returns the rows inserted.
 * The caller treats a throw as "no candidates" so the write never fails.
 */
export async function recordDreamCandidates(
  ctx: ActionCtx,
  args: { memoryId: string; embedding: number[] },
): Promise<number> {
  const scope = await ctx.runQuery(
    internal.dreamCandidates.candidateScopeInternal,
    { memoryId: args.memoryId },
  );
  if (!scope) return 0;
  const { userId, profileId } = scope;
  // the index filters one field; the mutation checks the other.
  // limit + 1: the memory itself is always its own top hit
  const hits = await ctx.vectorSearch("memoryEmbeddings", "by_embedding", {
    vector: args.embedding,
    limit: CANDIDATE_NEIGHBOUR_LIMIT + 1,
    filter: (q) =>
      profileId === undefined
        ? q.eq("userId", userId)
        : q.eq("profileId", profileId),
  });
  const near = hits.filter((hit) => hit._score >= MAYBE_CONFLICT_MIN_SCORE);
  if (near.length === 0) return 0;
  return await ctx.runMutation(
    internal.dreamCandidates.insertCandidatesInternal,
    {
      memoryDocId: scope.docId,
      hits: near.map((hit) => ({ embeddingId: hit._id, score: hit._score })),
    },
  );
}

// hourly: walks every candidate, drops rows older than 30 days or whose
// memory or neighbour is gone, hidden or suppressed
export const purgeInternal = internalMutation({
  args: { paginationOpts: v.optional(paginationOptsValidator) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - CANDIDATE_RETENTION_MS;
    const page = await ctx.db
      .query("dreamCandidates")
      .withIndex("by_created")
      .paginate(args.paginationOpts ?? { cursor: null, numItems: PURGE_PAGE });
    let deleted = 0;
    for (const row of page.page) {
      const memory = await ctx.db.get(row.memoryId);
      const neighbor = await ctx.db.get(row.neighborId);
      const keep =
        row.createdAt >= cutoff &&
        memory !== null &&
        neighbor !== null &&
        isVisibleStatus(memory.status) &&
        isVisibleStatus(neighbor.status);
      if (keep) continue;
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.dreamCandidates.purgeInternal, {
        paginationOpts: { cursor: page.continueCursor, numItems: PURGE_PAGE },
      });
    }
    return deleted;
  },
});
