import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { decryptToken, encryptToken, getEnvOrThrow } from "./lib/crypto";
import { retrier } from "./retrier";

/**
 * Public sync action — frontend calls this via useAction.
 * Validates ownership, handles token refresh, schedules background sync.
 */
export const startSync = authAction({
  args: {
    connectorId: v.id("connectors"),
    // Linear-only: if true, pull full history instead of the default 30-day window.
    // Ignored for all other providers.
    fullHistory: v.optional(v.boolean()),
  },
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
    const clerkId = await requireClerkId(ctx);

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

    // 5. Refresh expired tokens for providers that use refresh tokens
    //    (Google Drive + OneDrive). Notion + Linear have non-expiring tokens.
    const usesRefresh =
      connector.provider === "google_drive" ||
      connector.provider === "onedrive";
    if (usesRefresh && tokens.expiresAt < Date.now()) {
      if (!tokens.refreshToken) {
        throw new Error(
          "Token expired and no refresh token — please reconnect",
        );
      }

      const refreshToken = await decryptToken(tokens.refreshToken);

      let refreshUrl: string;
      let clientId: string;
      let clientSecret: string;
      if (connector.provider === "google_drive") {
        refreshUrl = "https://oauth2.googleapis.com/token";
        clientId = getEnvOrThrow("GOOGLE_CLIENT_ID");
        clientSecret = getEnvOrThrow("GOOGLE_CLIENT_SECRET");
      } else {
        // onedrive
        refreshUrl =
          "https://login.microsoftonline.com/common/oauth2/v2.0/token";
        clientId = getEnvOrThrow("MICROSOFT_CLIENT_ID");
        clientSecret = getEnvOrThrow("MICROSOFT_CLIENT_SECRET");
      }

      const refreshRes = await fetch(refreshUrl, {
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
        refresh_token?: string;
      }
      const refreshData: RefreshResponse = await refreshRes.json();
      if (!refreshData.access_token) {
        throw new Error("Token refresh failed — please reconnect");
      }

      // Microsoft rotates refresh tokens on each use — if a new one came back,
      // re-encrypt and persist it. Otherwise keep the existing encrypted refresh
      // token (Google does not rotate).
      const encryptedAccess = await encryptToken(refreshData.access_token);
      const encryptedRefresh = refreshData.refresh_token
        ? await encryptToken(refreshData.refresh_token)
        : tokens.refreshToken;

      await ctx.runMutation(internal.connectorTokens.storeTokensInternal, {
        connectorId: args.connectorId,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
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

    // 7. Schedule background sync based on provider.
    //    Routed through the retrier so transient Neo4j / Google / Notion
    //    failures replay with exponential backoff instead of surfacing as a
    //    silent half-finished sync.
    if (connector.provider === "google_drive") {
      await retrier.run(
        ctx,
        internal.neo4jActions.connectorSync.syncGoogleDriveInternal,
        {
          clerkId,
          connectorId: args.connectorId,
          accessToken,
        },
      );
    } else if (connector.provider === "notion") {
      await retrier.run(
        ctx,
        internal.neo4jActions.connectorSync.syncNotionInternal,
        {
          clerkId,
          connectorId: args.connectorId,
          accessToken,
        },
      );
    } else if (connector.provider === "onedrive") {
      await retrier.run(
        ctx,
        internal.neo4jActions.connectorSync.syncOneDriveInternal,
        {
          clerkId,
          connectorId: args.connectorId,
          accessToken,
        },
      );
    } else if (connector.provider === "linear") {
      await retrier.run(
        ctx,
        internal.neo4jActions.connectorSync.syncLinearInternal,
        {
          clerkId,
          connectorId: args.connectorId,
          accessToken,
          fullHistory: args.fullHistory ?? false,
        },
      );
    } else {
      throw new Error(`Unsupported provider: ${connector.provider}`);
    }

    // 8. Return immediately (fire-and-forget)
    return { started: true };
  },
});
