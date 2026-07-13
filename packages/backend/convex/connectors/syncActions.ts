"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { STALE_SYNCING_MS } from "@vmem/shared";
import { resolveConnectorAccessToken } from "../lib/connectorAccessToken";
import { runConnectorProviderSync } from "../lib/runConnectorProviderSync";

const syncOneResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), message: v.string() }),
);

type SyncOneResult = { ok: true } | { ok: false; message: string };

/**
 * Internal sync entry point for manual MCP hooks and the daily workflow.
 * Always runs a full provider sync.
 */
export const syncOneConnectorInternal = internalAction({
  args: {
    connectorId: v.id("connectors"),
    fullHistory: v.optional(v.boolean()),
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

    const isFreshSync =
      connector.syncStatus === "syncing" &&
      connector.syncStartedAt !== undefined &&
      Date.now() - connector.syncStartedAt < STALE_SYNCING_MS;
    if (isFreshSync) {
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
        fullHistory: args.fullHistory ?? false,
        execution: "direct",
      });

      return { ok: true };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Connector sync failed";
      console.error("[connector-sync]", args.connectorId, err);
      return { ok: false, message };
    }
  },
});
