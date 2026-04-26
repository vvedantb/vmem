import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

/**
 * CRUD primitives for the `contextPromptCache` table. Kept separate from
 * the actions file so they can run inside the Convex query/mutation
 * runtime — the Node-only regeneration action calls these via
 * `ctx.runQuery`/`ctx.runMutation`.
 *
 * Lookup is always by `clerkId` (which we translate to `users._id`
 * inside each function) so callers don't need to thread the internal
 * Convex ID through scheduling and HTTP boundaries.
 */

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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    return user?._id ?? null;
  },
});

/**
 * Look up the cache row for a clerkId. Returns null when no row exists
 * yet — `getContextPrompt` treats that as "first call, schedule a regen
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;
    const row = await ctx.db
      .query("contextPromptCache")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!row) return null;
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return false;
    const existing: Doc<"contextPromptCache"> | null = await ctx.db
      .query("contextPromptCache")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;
    const existing = await ctx.db
      .query("contextPromptCache")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
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
