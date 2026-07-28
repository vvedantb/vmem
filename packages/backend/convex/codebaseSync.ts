import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { codebaseSyncPool } from "./workpools";

// cron kickoff, enqueue one sync action per stale codebase (serial pool).
export const kickoffDailyCodebaseSync = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const targets = await ctx.runQuery(
      internal.codebases.listForDailySyncInternal,
      {},
    );
    if (targets.length === 0) {
      return null;
    }

    await codebaseSyncPool.enqueueActionBatch(
      ctx,
      internal.codebaseSyncActions.syncOneCodebaseInternal,
      targets.map((target) => ({ codebaseId: target.codebaseId })),
      { retry: true },
    );
    return null;
  },
});
