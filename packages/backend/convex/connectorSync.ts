import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";
import { decryptToken, getEnvOrThrow } from "./lib/crypto";

/**
 * Public sync action — frontend calls this via useAction.
 * Validates ownership, handles token refresh, schedules background sync.
 */
export const startSync = authAction({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args) => {
    // 1. Get connector and validate ownership
    const connector = await ctx.runQuery(internal.connectors.getByIdInternal, {
      id: args.connectorId,
    });
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }
    if (connector.connectionStatus !== "connected") {
      throw new Error("Connector is not connected");
    }
    if (!connector.provider) {
      throw new Error("Connector does not support sync");
    }

    // 2. Get clerkId for Neo4j operations
    const clerkId = await ctx.runQuery(internal.auth.getClerkIdInternal, {
      userId: ctx.userId,
    });
    if (!clerkId) {
      throw new Error("User not found");
    }

    // 3. Get tokens
    const tokens = await ctx.runQuery(
      internal.connectorTokens.getEncryptedTokensInternal,
      { connectorId: args.connectorId },
    );
    if (!tokens) {
      throw new Error("No tokens found — please reconnect");
    }

    // 4. Decrypt access token
    let accessToken = await decryptToken(tokens.accessToken);

    // 5. Refresh if Google token is expired
    if (
      connector.provider === "google_drive" &&
      tokens.expiresAt < Date.now()
    ) {
      if (!tokens.refreshToken) {
        throw new Error(
          "Token expired and no refresh token — please reconnect",
        );
      }

      const refreshToken = await decryptToken(tokens.refreshToken);
      const clientId = getEnvOrThrow("GOOGLE_CLIENT_ID");
      const clientSecret = getEnvOrThrow("GOOGLE_CLIENT_SECRET");

      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshRes.ok) {
        // Mark as disconnected if refresh fails
        await ctx.runMutation(internal.connectors.markDisconnectedInternal, {
          id: args.connectorId,
        });
        await ctx.runMutation(internal.connectorTokens.deleteTokensInternal, {
          connectorId: args.connectorId,
        });
        throw new Error("Token refresh failed — please reconnect");
      }

      interface RefreshResponse {
        access_token?: string;
        expires_in?: number;
      }
      const refreshData: RefreshResponse = await refreshRes.json();
      if (!refreshData.access_token) {
        throw new Error("Token refresh failed — please reconnect");
      }

      // Store new access token (reuse existing refresh token)
      const { encryptToken } = await import("./lib/crypto");
      const encryptedAccess = await encryptToken(refreshData.access_token);

      await ctx.runMutation(internal.connectorTokens.storeTokensInternal, {
        connectorId: args.connectorId,
        accessToken: encryptedAccess,
        refreshToken: tokens.refreshToken, // Keep existing encrypted refresh token
        expiresAt: Date.now() + (refreshData.expires_in ?? 3600) * 1000,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
      });

      accessToken = refreshData.access_token;
    }

    // 6. Mark as syncing
    await ctx.runMutation(internal.connectors.updateSyncProgressInternal, {
      id: args.connectorId,
      syncStatus: "syncing",
      syncProgress: 0,
      errorMessage: undefined,
    });

    // 7. Schedule background sync based on provider
    if (connector.provider === "google_drive") {
      await ctx.scheduler.runAfter(
        0,
        internal.neo4jActions.connectorSync.syncGoogleDriveInternal,
        {
          clerkId,
          connectorId: args.connectorId,
          accessToken,
        },
      );
    } else if (connector.provider === "notion") {
      await ctx.scheduler.runAfter(
        0,
        internal.neo4jActions.connectorSync.syncNotionInternal,
        {
          clerkId,
          connectorId: args.connectorId,
          accessToken,
        },
      );
    } else {
      throw new Error(`Unsupported provider: ${connector.provider}`);
    }

    // 8. Return immediately (fire-and-forget)
    return { started: true };
  },
});
