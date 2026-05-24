"use node";

import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { STALE_SYNCING_MS } from "./codebaseSyncConstants";
import { resolveConnectorAccessToken } from "./lib/connectorAccessToken";
import { runGmailSync } from "./neo4jActions/connectors/gmail";
import { runGoogleDriveSync } from "./neo4jActions/connectors/googleDrive";
import { runLinearSync } from "./neo4jActions/connectors/linear";
import { runNotionSync } from "./neo4jActions/connectors/notion";
import { runOneDriveSync } from "./neo4jActions/connectors/oneDrive";

const syncOneResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), message: v.string() }),
);

type SyncOneResult = { ok: true } | { ok: false; message: string };

/**
 * Internal sync entry point for manual MCP hooks and the daily workflow.
 * Always runs a full provider sync (Linear uses fullHistory when requested).
 */
export const syncOneConnectorInternal = internalAction({
  args: {
    connectorId: v.id("connectors"),
    fullHistory: v.optional(v.boolean()),
  },
  returns: syncOneResult,
  handler: async (ctx, args): Promise<SyncOneResult> => {
    const connector = await ctx.runQuery(internal.connectors.getByIdInternal, {
      id: args.connectorId,
    });
    if (!connector) {
      return { ok: false, message: "Connector not found" };
    }
    if (connector.connectionStatus !== "connected") {
      return { ok: false, message: "Connector is not connected" };
    }
    if (!connector.provider) {
      return { ok: false, message: "Connector does not support sync" };
    }

    const syncingFresh =
      connector.syncStatus === "syncing" &&
      connector.syncStartedAt !== undefined &&
      Date.now() - connector.syncStartedAt < STALE_SYNCING_MS;
    if (connector.syncStatus === "syncing" && syncingFresh) {
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
      await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
        id: args.connectorId,
        syncStatus: "syncing",
        syncProgress: 0,
        syncStartedAt: Date.now(),
        errorMessage: undefined,
      });

      await runConnectorProviderSyncDirect(ctx, {
        connector,
        clerkId,
        accessToken: tokenResult.accessToken,
        fullHistory: args.fullHistory ?? false,
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

async function runConnectorProviderSyncDirect(
  ctx: ActionCtx,
  params: {
    connector: Doc<"connectors">;
    clerkId: string;
    accessToken: string;
    fullHistory: boolean;
  },
): Promise<void> {
  const syncArgs = {
    clerkId: params.clerkId,
    connectorId: params.connector._id,
    accessToken: params.accessToken,
  };

  const provider = params.connector.provider;
  if (provider === "google_drive") {
    await runGoogleDriveSync(ctx, syncArgs);
    return;
  }
  if (provider === "gmail") {
    await runGmailSync(ctx, syncArgs);
    return;
  }
  if (provider === "notion") {
    await runNotionSync(ctx, syncArgs);
    return;
  }
  if (provider === "onedrive") {
    await runOneDriveSync(ctx, syncArgs);
    return;
  }
  if (provider === "linear") {
    await runLinearSync(ctx, { ...syncArgs, fullHistory: params.fullHistory });
    return;
  }

  throw new Error("Connector does not support sync");
}
