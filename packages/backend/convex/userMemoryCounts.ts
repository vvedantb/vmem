import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { getUserMemoryCountRow } from "./lib/userMemoryCount";

const BACKFILL_BATCH = 100;

// ONE-OFF, idempotent: sets `userMemoryCounts` from the real `memories` rows,
// one user per scheduler chain link, in bounded pages. Safe to run again: it
// overwrites each count with the walked total. Run once after deploy; run
// again if a delete raced the walk.
//   npx convex run userMemoryCounts:startUserMemoryCountBackfillInternal '{}'
export const startUserMemoryCountBackfillInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.userMemoryCounts.backfillUserMemoryCountStepInternal,
      {},
    );
    return null;
  },
});

// Without `user`, finds the next user after `lastUser` (skip-scan on the
// by_user_created index). With `user`, counts one page of that user's rows.
export const backfillUserMemoryCountStepInternal = internalMutation({
  args: {
    lastUser: v.optional(v.string()),
    user: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
    running: v.optional(v.number()),
  },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, args) => {
    const next = internal.userMemoryCounts.backfillUserMemoryCountStepInternal;
    const { user } = args;
    if (user === undefined) {
      const lastUser = args.lastUser;
      const first = await ctx.db
        .query("memories")
        .withIndex("by_user_created", (q) =>
          lastUser === undefined ? q : q.gt("userId", lastUser),
        )
        .first();
      if (first === null) return { done: true };
      await ctx.scheduler.runAfter(0, next, {
        user: first.userId,
        cursor: null,
        running: 0,
      });
      return { done: false };
    }
    const page = await ctx.db
      .query("memories")
      .withIndex("by_user_created", (q) => q.eq("userId", user))
      .paginate({ cursor: args.cursor ?? null, numItems: BACKFILL_BATCH });
    const running = (args.running ?? 0) + page.page.length;
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, next, {
        user,
        cursor: page.continueCursor,
        running,
      });
      return { done: false };
    }
    const row = await getUserMemoryCountRow(ctx, user);
    if (row === null) {
      await ctx.db.insert("userMemoryCounts", { userId: user, count: running });
    } else {
      await ctx.db.patch(row._id, { count: running });
    }
    await ctx.scheduler.runAfter(0, next, { lastUser: user });
    return { done: false };
  },
});
