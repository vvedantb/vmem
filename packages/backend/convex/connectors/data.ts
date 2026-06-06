import { v } from "convex/values";
import { authAction, requireClerkId } from "../auth";
import { internal } from "../_generated/api";
import { auditLog, ResourceTypes } from "../auditLog";
import { sourceTypesForProvider } from "../../engine/neo4j/memory/connectorSourceTypes";

/**
 * Permanently deletes all memories imported from a connector's source types.
 * Does not revoke OAuth — use disconnect for that.
 */
export const deleteConnectorData = authAction({
  args: { connectorId: v.id("connectors") },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const connector = await ctx.runQuery(
      internal.connectors.crud.getByIdInternal,
      {
        id: args.connectorId,
      },
    );
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }
    if (!connector.provider) {
      throw new Error("Connector does not support data deletion");
    }

    const sourceTypes = sourceTypesForProvider(connector.provider);
    if (sourceTypes === null || sourceTypes.length === 0) {
      throw new Error("Connector does not support data deletion");
    }

    const clerkId = await requireClerkId(ctx);

    const deleted: number = await ctx.runAction(
      internal.neo4jActions.connectorData.deleteBySourceTypesInternal,
      { clerkId, sourceTypes: [...sourceTypes] },
    );

    await ctx.runMutation(internal.connectors.crud.resetSyncStatsInternal, {
      id: args.connectorId,
    });

    await auditLog.log(ctx, {
      action: "connector.data_deleted",
      actorId: ctx.userId,
      resourceType: ResourceTypes.CONNECTOR,
      resourceId: args.connectorId,
      metadata: {
        name: connector.name,
        provider: connector.provider,
        deletedCount: deleted,
      },
      severity: "warning",
    });

    return deleted;
  },
});
