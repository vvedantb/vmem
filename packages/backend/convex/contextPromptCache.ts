import { internalQuery, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getUserByClerkId } from "./auth";

async function getCacheRowByClerkId(
  ctx: QueryCtx | MutationCtx,
  clerkId: string,
): Promise<{
  user: Doc<"users">;
  row: Doc<"contextPromptCache"> | null;
} | null> {
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) return null;
  const row = await ctx.db
    .query("contextPromptCache")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();
  return { user, row };
}

/**
 * Resolve a clerkId to the internal Convex `users._id`. The regen
 * action needs this to call `userSettings.getUserContextInternal`,
 * which is keyed on the internal id. Returns null when no user row
 * exists yet (race with onboarding).
 */
export const resolveUserIdByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    return user?._id ?? null;
  },
});

/**
 * Look up the cache row for a clerkId. Returns null when no row exists
 * yet — `mcpGetContextPrompt` treats that as "first call, schedule a regen
 * and return placeholder".
 */
export const getByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(
    v.object({
      content: v.string(),
      generatedAt: v.number(),
      memoryCountAtGeneration: v.number(),
      pendingRegeneration: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const found = await getCacheRowByClerkId(ctx, args.clerkId);
    if (!found?.row) return null;
    const { row } = found;
    return {
      content: row.content,
      generatedAt: row.generatedAt,
      memoryCountAtGeneration: row.memoryCountAtGeneration,
      pendingRegeneration: row.pendingRegeneration,
    };
  },
});

/**
 * Mark the cache as needing regeneration. Called from every memory
 * write path. Creates the row on first invalidation so subsequent reads
 * see a consistent shape.
 *
 * Returns true if the caller should schedule a debounced regen check
 * (i.e. there wasn't already one in flight). Returns false when an
 * earlier write already scheduled a check, so the caller can skip the
 * scheduler call and avoid piling up redundant jobs.
 */
export const markPendingByClerkIdInternal = internalMutation({
  args: { clerkId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const found = await getCacheRowByClerkId(ctx, args.clerkId);
    if (!found) return false;
    const { user, row: existing } = found;
    if (!existing) {
      await ctx.db.insert("contextPromptCache", {
        userId: user._id,
        content: "",
        generatedAt: 0,
        memoryCountAtGeneration: 0,
        pendingRegeneration: true,
      });
      return true;
    }
    if (existing.pendingRegeneration) {
      // Already pending — a debounce check is already scheduled.
      return false;
    }
    await ctx.db.patch(existing._id, { pendingRegeneration: true });
    return true;
  },
});

/**
 * Persist freshly generated content and clear the pending flag. Called
 * from the regenerate action after a successful LLM round-trip.
 */
export const upsertByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    content: v.string(),
    memoryCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const found = await getCacheRowByClerkId(ctx, args.clerkId);
    if (!found) return null;
    const { user, row: existing } = found;
    const now = Date.now();
    if (!existing) {
      await ctx.db.insert("contextPromptCache", {
        userId: user._id,
        content: args.content,
        generatedAt: now,
        memoryCountAtGeneration: args.memoryCount,
        pendingRegeneration: false,
      });
      return null;
    }
    await ctx.db.patch(existing._id, {
      content: args.content,
      generatedAt: now,
      memoryCountAtGeneration: args.memoryCount,
      pendingRegeneration: false,
    });
    return null;
  },
});
