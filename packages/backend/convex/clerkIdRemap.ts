import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// ONE-OFF: remap a Clerk user id after switching Clerk instances.
// Memory data is keyed by the Clerk id string (not users._id), so patching only
// users.clerkId would orphan memories/links/entities/proposals.
//
// Run per user, repeating until every count is 0 and `done` is true:
//   npx convex run clerkIdRemap:remapClerkId \
//     '{"fromClerkId":"user_OLD","toClerkId":"user_NEW"}'
// Dry run: add "dryRun":true. users.clerkId is flipped last, once every other
// table has been moved, so the old id stays resolvable until the end.
// Safe to delete after the cutover.

const BATCH = 150;

export const remapClerkId = internalMutation({
  args: {
    fromClerkId: v.string(),
    toClerkId: v.string(),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    done: v.boolean(),
    moved: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    const { fromClerkId, toClerkId } = args;
    const dryRun = args.dryRun ?? false;
    if (fromClerkId === toClerkId) throw new Error("ids are identical");
    if (!fromClerkId.startsWith("user_") || !toClerkId.startsWith("user_")) {
      throw new Error("expected Clerk user ids (user_…)");
    }

    const target = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", toClerkId))
      .first();
    if (target) {
      throw new Error(
        "a users row already uses toClerkId (user signed in already?). Merge or delete that row first.",
      );
    }

    const moved: Record<string, number> = {};
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_user_created", (q) => q.eq("userId", fromClerkId))
      .take(BATCH);
    moved.memories = memories.length;
    if (!dryRun) {
      for (const r of memories) {
        await ctx.db.patch(r._id, { userId: toClerkId });
        const emb = await ctx.db
          .query("memoryEmbeddings")
          .withIndex("by_memory_doc", (q) => q.eq("memoryDocId", r._id))
          .first();
        if (emb) await ctx.db.patch(emb._id, { userId: toClerkId });
      }
    }

    const links = await ctx.db
      .query("memoryLinks")
      .withIndex("by_user", (q) => q.eq("userId", fromClerkId))
      .take(BATCH);
    moved.memoryLinks = links.length;
    if (!dryRun) {
      for (const r of links) await ctx.db.patch(r._id, { userId: toClerkId });
    }

    const entities = await ctx.db
      .query("memoryEntities")
      .withIndex("by_user", (q) => q.eq("userId", fromClerkId))
      .take(BATCH);
    moved.memoryEntities = entities.length;
    if (!dryRun) {
      for (const r of entities)
        await ctx.db.patch(r._id, { userId: toClerkId });
    }

    const mentions = await ctx.db
      .query("memoryEntityMentions")
      .withIndex("by_user_normalized", (q) => q.eq("userId", fromClerkId))
      .take(BATCH);
    moved.memoryEntityMentions = mentions.length;
    if (!dryRun) {
      for (const r of mentions)
        await ctx.db.patch(r._id, { userId: toClerkId });
    }

    const proposals = await ctx.db
      .query("proposedUpdates")
      .withIndex("by_user_status", (q) => q.eq("userId", fromClerkId))
      .take(BATCH);
    moved.proposedUpdates = proposals.length;
    if (!dryRun) {
      for (const r of proposals)
        await ctx.db.patch(r._id, { userId: toClerkId });
    }

    const pending = Object.values(moved).reduce((a, b) => a + b, 0);
    if (pending > 0) return { done: false, moved };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", fromClerkId))
      .first();
    moved.users = user ? 1 : 0;
    if (user && !dryRun) await ctx.db.patch(user._id, { clerkId: toClerkId });
    return { done: true, moved };
  },
});
