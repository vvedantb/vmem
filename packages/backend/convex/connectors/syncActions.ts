"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { isFreshSyncing } from "./crud";
import { resolveConnectorAccessToken } from "../lib/connectorAccessToken";
import { runConnectorProviderSync } from "../lib/runConnectorProviderSync";

const syncOneResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), message: v.string() }),
);

type SyncOneResult = { ok: true } | { ok: false; message: string };

export const syncOneConnectorInternal = internalAction({
  args: {
    connectorId: v.id("connectors"),
  },
  returns: syncOneResult,
  handler: async (ctx, args): Promise<SyncOneResult> => {
    const connector = await ctx.runQuery(
      internal.connectors.crud.getByIdInternal,
      {
        id: args.connectorId,
      },
    );
    if (!connector) {
      return { ok: false, message: "Connector not found" };
    }
    if (connector.connectionStatus !== "connected") {
      return { ok: false, message: "Connector is not connected" };
    }
    if (!connector.provider) {
      return { ok: false, message: "Connector does not support sync" };
    }

    if (isFreshSyncing(connector)) {
      return { ok: false, message: "Sync already in progress" };
    }

    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: connector.userId,
    });
    if (!clerkId) {
      return { ok: false, message: "User not found" };
    }

    const tokenResult = await resolveConnectorAccessToken(ctx, connector);
    if (!tokenResult.ok) {
      return { ok: false, message: tokenResult.message };
    }

    try {
      await ctx.runMutation(
        internal.connectors.crud.updateSyncProgressInternal,
        {
          id: args.connectorId,
          syncStatus: "syncing",
          syncProgress: 0,
          syncStartedAt: Date.now(),
          errorMessage: undefined,
        },
      );

      await runConnectorProviderSync(ctx, {
        connector,
        clerkId,
        accessToken: tokenResult.accessToken,
        execution: "direct",
      });

      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connector sync failed";
      console.error("[connector-sync]", args.connectorId, err);
      // the daily connector cron runs unattended at 0400 utc, without this a failed ingest is invisible until the user notices stale memories
      await ctx.runMutation(internal.notifications.pushInternal, {
        userId: connector.userId,
        title: `Connector sync failed — ${connector.name}`,
        description: message,
        type: "error",
      });
      return { ok: false, message };
    }
  },
});
