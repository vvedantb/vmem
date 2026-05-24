import { v } from "convex/values";
import { start } from "@convex-dev/workflow";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { workflow } from "./workflow";

const dailySyncResult = v.object({
  synced: v.number(),
  failed: v.number(),
  skipped: v.number(),
});

/**
 * Durable orchestrator: one workflow step per codebase so each sync gets a
 * full Convex action timeout (not one shared limit for the whole batch).
 */
export const dailyCodebaseSyncWorkflow = workflow
  .define({
    args: {},
    returns: dailySyncResult,
  })
  .handler(
    async (
      step,
    ): Promise<{
      synced: number;
      failed: number;
      skipped: number;
    }> => {
      const targets = await step.runQuery(
        internal.codebases.listForDailySyncInternal,
        {},
      );

      let synced = 0;
      let failed = 0;

      for (const target of targets) {
        const result = await step.runAction(
          internal.codebaseSyncActions.syncOneCodebaseInternal,
          { codebaseId: target.codebaseId },
          { retry: true },
        );
        if (result.ok) {
          synced += 1;
        } else {
          failed += 1;
          console.error("[codebase-sync]", target.codebaseId, result.message);
        }
      }

      return { synced, failed, skipped: 0 };
    },
  );

/** Started by the global daily cron in `crons.ts`. */
export const kickoffDailyCodebaseSync = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await start(ctx, internal.codebaseSync.dailyCodebaseSyncWorkflow, {});
    return null;
  },
});
