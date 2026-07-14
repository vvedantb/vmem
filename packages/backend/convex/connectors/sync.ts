import { v } from "convex/values";
import { authAction, requireClerkId } from "../auth";
import { internal } from "../_generated/api";
import { resolveConnectorAccessToken } from "../lib/connectorAccessToken";
import { runConnectorProviderSync } from "../lib/runConnectorProviderSync";

export const startSync = authAction({
  args: {
    connectorId: v.id("connectors"),
  },
  handler: async (ctx, args) => {
    const connector = await ctx.runQuery(
      internal.connectors.crud.getByIdInternal,
      {
        id: args.connectorId,
      },
    );
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }
    if (connector.connectionStatus !== "connected") {
      throw new Error("Connector is not connected");
    }
    if (!connector.provider) {
      throw new Error("Connector does not support sync");
    }

    const clerkId = await requireClerkId(ctx);

    const tokenResult = await resolveConnectorAccessToken(ctx, connector);
    if (!tokenResult.ok) {
      throw new Error(tokenResult.message);
    }

    await ctx.runMutation(internal.connectors.crud.updateSyncProgressInternal, {
      id: args.connectorId,
      syncStatus: "syncing",
      syncProgress: 0,
      syncStartedAt: Date.now(),
      errorMessage: undefined,
    });

    await runConnectorProviderSync(ctx, {
      connector,
      clerkId,
      accessToken: tokenResult.accessToken,
      execution: "retrier",
    });

    return { started: true };
  },
});
