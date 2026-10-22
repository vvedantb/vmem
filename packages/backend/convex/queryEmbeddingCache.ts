import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";

// Query embeddings from retrieve, kept briefly so a repeated message (an
// agent calling recall_context each turn) skips the embedding network call.
// Keyed per user (see queryEmbeddingCacheKey), pruned by cron.

export const QUERY_EMBEDDING_CACHE_TTL_MS = 60 * 60 * 1000;
const PURGE_BATCH = 200;

export const getInternal = internalQuery({
  args: { key: v.string() },
  returns: v.union(
    v.object({ embedding: v.array(v.float64()), expiresAt: v.number() }),
    v.null(),
  ),
  // expiry is checked by the caller, so this query stays cacheable
  handler: async (ctx, { key }) => readQueryEmbeddingCache(ctx, key),
});

export async function readQueryEmbeddingCache(
  ctx: QueryCtx,
  key: string,
): Promise<{ embedding: number[]; expiresAt: number } | null> {
  const row = await ctx.db
    .query("queryEmbeddingCache")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return row === null
    ? null
    : { embedding: row.embedding, expiresAt: row.expiresAt };
}

export const putInternal = internalMutation({
  args: {
    key: v.string(),
    embedding: v.array(v.float64()),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("queryEmbeddingCache")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (row === null) {
      await ctx.db.insert("queryEmbeddingCache", args);
    } else if (row.expiresAt < args.expiresAt) {
      await ctx.db.patch(row._id, {
        embedding: args.embedding,
        expiresAt: args.expiresAt,
      });
    }
    return null;
  },
});

export const purgeExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("queryEmbeddingCache")
      .withIndex("by_expires", (q) => q.lt("expiresAt", Date.now()))
      .take(PURGE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.queryEmbeddingCache.purgeExpired,
        {},
      );
    }
    return rows.length;
  },
});
