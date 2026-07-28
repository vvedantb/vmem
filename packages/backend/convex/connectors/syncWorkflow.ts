import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { connectorSyncPool } from "../workpools";

// cron kickoff, enqueue one sync action per connected connector (serial pool).
export const kickoffDailyConnectorSync = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const targets = await ctx.runQuery(
      internal.connectors.crud.listForDailyConnectorSyncInternal,
      {},
    );
    if (targets.length === 0) {
      return null;
    }

    await connectorSyncPool.enqueueActionBatch(
      ctx,
      internal.connectors.syncActions.syncOneConnectorInternal,
      targets.map((target) => ({ connectorId: target.connectorId })),
      { retry: true },
    );
    return null;
  },
});
