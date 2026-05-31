import { v } from "convex/values";
import { start } from "@convex-dev/workflow";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { workflow } from "../workflow";

const dailySyncResult = v.object({
  synced: v.number(),
  failed: v.number(),
  skipped: v.number(),
});

/**
 * Durable orchestrator: one workflow step per connected connector so each
 * sync gets a full Convex action timeout (same pattern as codebase daily sync).
 */
export const dailyConnectorSyncWorkflow = workflow
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
        internal.connectors.crud.listForDailyConnectorSyncInternal,
        {},
      );

      let synced = 0;
      let failed = 0;

      for (const target of targets) {
        const result = await step.runAction(
          internal.connectors.syncActions.syncOneConnectorInternal,
          {
            connectorId: target.connectorId,
            fullHistory: true,
          },
          { retry: true },
        );
        if (result.ok) {
          synced += 1;
        } else {
          failed += 1;
          console.error("[connector-sync]", target.connectorId, result.message);
        }
      }

      return { synced, failed, skipped: 0 };
    },
  );

/** Started by the global daily cron in `crons.ts` (04:00 UTC). */
export const kickoffDailyConnectorSync = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await start(
      ctx,
      internal.connectors.syncWorkflow.dailyConnectorSyncWorkflow,
      {},
    );
    return null;
  },
});
