import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { authAction } from "../auth";
import { encryptToken, decryptToken, getEnvOrThrow } from "../lib/crypto";
import { oauthAccessTokenSchema, parseResponseJson } from "../lib/jsonBoundary";
import { z } from "zod";
import { auditLog, ResourceTypes } from "../auditLog";
import {
  GOOGLE_OAUTH_SCOPES,
  pickGoogleTokenConnectorId,
  scopeIncludesDrive,
  scopeIncludesGmail,
} from "../neo4jActions/connectors/googleShared";

// --- Provider configurations ---

type Provider = "google_drive" | "gmail" | "notion" | "onedrive" | "linear";

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string | null;
  scopes: string[];
}

const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  google_drive: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: [...GOOGLE_OAUTH_SCOPES],
  },
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: [...GOOGLE_OAUTH_SCOPES],
  },
  notion: {
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    revokeUrl: null,
    scopes: [],
  },
  onedrive: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    revokeUrl: null,
    scopes: ["Files.Read.All", "offline_access"],
  },
  linear: {
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    revokeUrl: "https://api.linear.app/oauth/revoke",
    scopes: ["read"],
  },
};

function isConnectorOAuthProvider(value: string): value is Provider {
  return value in PROVIDER_CONFIGS;
}

type OAuthAccessTokenData = z.infer<typeof oauthAccessTokenSchema>;

type OAuthTokenExchangeResult =
  | { ok: true; tokenData: OAuthAccessTokenData & { access_token: string } }
  | { ok: false; error: string };

/** Fetch + parse a provider token endpoint response. */
async function exchangeOAuthAccessToken(
  tokenUrl: string,
  init: RequestInit,
): Promise<OAuthTokenExchangeResult> {
  const tokenRes = await fetch(tokenUrl, init);
  if (!tokenRes.ok) {
    return { ok: false, error: "token_exchange_failed" };
  }
  const tokenData = await parseResponseJson(tokenRes, oauthAccessTokenSchema);
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    return { ok: false, error: tokenData.error ?? "no_token" };
  }
  return { ok: true, tokenData: { ...tokenData, access_token: accessToken } };
}

type StoreOAuthTokensOptions = {
  refreshToken: string;
  expiresAt: number;
};

/** Encrypt access (+ optional refresh) tokens and persist on the connector. */
async function encryptAndStoreOAuthTokens(
  ctx: ActionCtx,
  connectorId: Id<"connectors">,
  tokenData: OAuthAccessTokenData & { access_token: string },
  options: StoreOAuthTokensOptions,
): Promise<void> {
  const encryptedAccess = await encryptToken(tokenData.access_token);
  const encryptedRefresh = await encryptToken(options.refreshToken);
  await ctx.runMutation(internal.connectors.tokens.storeTokensInternal, {
    connectorId,
    accessToken: encryptedAccess,
    refreshToken: encryptedRefresh,
    expiresAt: options.expiresAt,
    tokenType: tokenData.token_type ?? "Bearer",
    scope: tokenData.scope ?? "",
  });
}

// --- Public actions ---

/**
 * Initiates the connector OAuth flow.
 * Creates a state token tied to the current user + connector, returns the provider's authorize URL.
 * Frontend opens this URL in a popup.
 */
const startOAuthResult = v.object({
  authUrl: v.union(v.string(), v.null()),
  alreadyConnected: v.boolean(),
});

export const startOAuth = authAction({
  args: { connectorId: v.id("connectors"), returnUrl: v.string() },
  returns: startOAuthResult,
  handler: async (
    ctx,
    args,
  ): Promise<{ authUrl: string | null; alreadyConnected: boolean }> => {
    // 1. Get connector and validate provider
    const connector = await ctx.runQuery(
      internal.connectors.crud.getByIdInternal,
      {
        id: args.connectorId,
      },
    );
    if (!connector) {
      throw new Error("Connector not found");
    }
    if (connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }
    if (!connector.provider) {
      throw new Error("Connector does not support OAuth");
    }

    if (!isConnectorOAuthProvider(connector.provider)) {
      throw new Error(`Unsupported provider: ${connector.provider}`);
    }
    const provider: Provider = connector.provider;

    const config: ProviderConfig = PROVIDER_CONFIGS[provider];
    const convexSiteUrl = getEnvOrThrow("CONVEX_SITE_URL");

    if (provider === "google_drive" || provider === "gmail") {
      const googleRows = await ctx.runQuery(
        internal.connectors.crud.listGoogleConnectorsForUserInternal,
        { userId: ctx.userId },
      );
      const tokenConnectorId = pickGoogleTokenConnectorId(googleRows, provider);
      if (tokenConnectorId) {
        const tokens = await ctx.runQuery(
          internal.connectors.tokens.getEncryptedTokensInternal,
          { connectorId: tokenConnectorId },
        );
        const scopeOk =
          provider === "gmail"
            ? tokens !== null && scopeIncludesGmail(tokens.scope)
            : tokens !== null && scopeIncludesDrive(tokens.scope);
        if (scopeOk) {
          await ctx.runMutation(
            internal.connectors.crud.markConnectedInternal,
            {
              id: args.connectorId,
            },
          );
          return { authUrl: null, alreadyConnected: true };
        }
      }
    }

    // 2. Generate state and store in oauthStates
    const state = crypto.randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    await ctx.runMutation(internal.oauthState.insertOAuthStateInternal, {
      state,
      userId: ctx.userId,
      returnUrl: args.returnUrl,
      expiresAt,
      connectorId: args.connectorId,
      provider,
    });

    // 3. Build provider auth URL
    const redirectUri = `${convexSiteUrl}/api/auth/connector/callback`;

    if (provider === "google_drive" || provider === "gmail") {
      const clientId = getEnvOrThrow("GOOGLE_CLIENT_ID");
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return {
        authUrl: `${config.authUrl}?${params.toString()}`,
        alreadyConnected: false,
      };
    }

    if (provider === "notion") {
      const clientId = getEnvOrThrow("NOTION_CLIENT_ID");
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        owner: "user",
        state,
      });
      return {
        authUrl: `${config.authUrl}?${params.toString()}`,
        alreadyConnected: false,
      };
    }

    if (provider === "onedrive") {
      const clientId = getEnvOrThrow("MICROSOFT_CLIENT_ID");
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        response_mode: "query",
        prompt: "consent",
        state,
      });
      return {
        authUrl: `${config.authUrl}?${params.toString()}`,
        alreadyConnected: false,
      };
    }

    if (provider === "linear") {
      const clientId = getEnvOrThrow("LINEAR_CLIENT_ID");
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        prompt: "consent",
        state,
      });
      return {
        authUrl: `${config.authUrl}?${params.toString()}`,
        alreadyConnected: false,
      };
    }

    throw new Error(`Unsupported provider: ${provider}`);
  },
});

/**
 * Disconnects a connector — revokes tokens with provider and cleans up.
 */
export const disconnect = authAction({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args) => {
    // 1. Get connector and validate ownership
    const connector = await ctx.runQuery(
      internal.connectors.crud.getByIdInternal,
      {
        id: args.connectorId,
      },
    );
    if (!connector || connector.userId !== ctx.userId) {
      throw new Error("Connector not found");
    }

    // 2. Get and revoke tokens if provider supports it
    const tokens = await ctx.runQuery(
      internal.connectors.tokens.getEncryptedTokensInternal,
      { connectorId: args.connectorId },
    );

    if (
      tokens &&
      (connector.provider === "google_drive" || connector.provider === "gmail")
    ) {
      try {
        const accessToken = await decryptToken(tokens.accessToken);
        // Revoke with Google API
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
          { method: "POST" },
        );
      } catch {
        // Best effort — continue even if revocation fails
      }
    }

    if (tokens && connector.provider === "linear") {
      try {
        const accessToken = await decryptToken(tokens.accessToken);
        // Revoke with Linear API (best-effort)
        await fetch("https://api.linear.app/oauth/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ access_token: accessToken }),
        });
      } catch {
        // Best effort — continue even if revocation fails
      }
    }

    // OneDrive: no revoke endpoint for consumer accounts — token deletion only

    // 3. Delete tokens and mark disconnected
    await ctx.runMutation(internal.connectors.tokens.deleteTokensInternal, {
      connectorId: args.connectorId,
    });
    await ctx.runMutation(internal.connectors.crud.markDisconnectedInternal, {
      id: args.connectorId,
    });

    await auditLog.log(ctx, {
      action: "connector.disconnected",
      actorId: ctx.userId,
      resourceType: ResourceTypes.CONNECTOR,
      resourceId: args.connectorId,
      metadata: {
        name: connector.name,
        provider: connector.provider ?? null,
        via: "oauth_revoke",
      },
      severity: "warning",
    });
  },
});

// --- Internal action for handling OAuth callback ---

const notionTokenResponseSchema = oauthAccessTokenSchema.extend({
  bot_id: z.string().optional(),
  workspace_id: z.string().optional(),
  workspace_name: z.string().optional(),
});

type OAuthCallbackResult = {
  error: string | null;
  frontendUrl: string | null;
  connectorId: string | null;
};

export const handleCallbackInternal = internalAction({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<OAuthCallbackResult> => {
    // 1. Consume and validate state
    const stateEntry = await ctx.runMutation(
      internal.oauthState.consumeOAuthStateInternal,
      { state: args.state },
    );
    if (!stateEntry) {
      return { error: "invalid_state", frontendUrl: null, connectorId: null };
    }
    if (stateEntry.expiresAt < Date.now()) {
      return {
        error: "expired_state",
        frontendUrl: stateEntry.returnUrl,
        connectorId: stateEntry.connectorId ?? null,
      };
    }
    if (!stateEntry.connectorId || !stateEntry.provider) {
      return {
        error: "invalid_state",
        frontendUrl: stateEntry.returnUrl,
        connectorId: null,
      };
    }

    if (!isConnectorOAuthProvider(stateEntry.provider)) {
      return {
        error: "invalid_state",
        frontendUrl: stateEntry.returnUrl,
        connectorId: stateEntry.connectorId,
      };
    }

    const provider = stateEntry.provider;
    const convexSiteUrl = getEnvOrThrow("CONVEX_SITE_URL");
    const redirectUri = `${convexSiteUrl}/api/auth/connector/callback`;

    // 2. Exchange code for tokens based on provider
    if (provider === "google_drive" || provider === "gmail") {
      const clientId = getEnvOrThrow("GOOGLE_CLIENT_ID");
      const clientSecret = getEnvOrThrow("GOOGLE_CLIENT_SECRET");

      const exchanged = await exchangeOAuthAccessToken(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code: args.code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        },
      );
      if (!exchanged.ok) {
        return {
          error: exchanged.error,
          frontendUrl: stateEntry.returnUrl,
          connectorId: stateEntry.connectorId,
        };
      }
      await encryptAndStoreOAuthTokens(
        ctx,
        stateEntry.connectorId,
        exchanged.tokenData,
        {
          refreshToken: exchanged.tokenData.refresh_token ?? "",
          expiresAt:
            Date.now() + (exchanged.tokenData.expires_in ?? 3600) * 1000,
        },
      );
    } else if (provider === "notion") {
      const clientId = getEnvOrThrow("NOTION_CLIENT_ID");
      const clientSecret = getEnvOrThrow("NOTION_CLIENT_SECRET");

      // Notion uses Basic auth for token exchange
      const basicAuth = btoa(`${clientId}:${clientSecret}`);

      const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: args.code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        return {
          error: "token_exchange_failed",
          frontendUrl: stateEntry.returnUrl,
          connectorId: stateEntry.connectorId,
        };
      }

      const tokenData = await parseResponseJson(
        tokenRes,
        notionTokenResponseSchema,
      );
      if (!tokenData.access_token) {
        return {
          error: tokenData.error ?? "no_token",
          frontendUrl: stateEntry.returnUrl,
          connectorId: stateEntry.connectorId,
        };
      }

      // Notion tokens don't expire, no refresh token
      const encryptedAccess = await encryptToken(tokenData.access_token);

      await ctx.runMutation(internal.connectors.tokens.storeTokensInternal, {
        connectorId: stateEntry.connectorId,
        accessToken: encryptedAccess,
        refreshToken: "", // Notion has no refresh token
        expiresAt: 0, // Never expires
        tokenType: tokenData.token_type ?? "Bearer",
        scope: "",
      });
    } else if (provider === "onedrive") {
      const clientId = getEnvOrThrow("MICROSOFT_CLIENT_ID");
      const clientSecret = getEnvOrThrow("MICROSOFT_CLIENT_SECRET");

      const exchanged = await exchangeOAuthAccessToken(
        PROVIDER_CONFIGS.onedrive.tokenUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: args.code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
            scope: PROVIDER_CONFIGS.onedrive.scopes.join(" "),
          }),
        },
      );
      if (!exchanged.ok) {
        return {
          error: exchanged.error,
          frontendUrl: stateEntry.returnUrl,
          connectorId: stateEntry.connectorId,
        };
      }
      await encryptAndStoreOAuthTokens(
        ctx,
        stateEntry.connectorId,
        exchanged.tokenData,
        {
          refreshToken: exchanged.tokenData.refresh_token ?? "",
          expiresAt:
            Date.now() + (exchanged.tokenData.expires_in ?? 3600) * 1000,
        },
      );
    } else if (provider === "linear") {
      const clientId = getEnvOrThrow("LINEAR_CLIENT_ID");
      const clientSecret = getEnvOrThrow("LINEAR_CLIENT_SECRET");

      const exchanged = await exchangeOAuthAccessToken(
        PROVIDER_CONFIGS.linear.tokenUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: args.code,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        },
      );
      if (!exchanged.ok) {
        return {
          error: exchanged.error,
          frontendUrl: stateEntry.returnUrl,
          connectorId: stateEntry.connectorId,
        };
      }
      // Linear access tokens last ~10 years and have no refresh token.
      await encryptAndStoreOAuthTokens(
        ctx,
        stateEntry.connectorId,
        exchanged.tokenData,
        {
          refreshToken: "",
          expiresAt: 0,
        },
      );
    } else {
      return {
        error: `unsupported_provider: ${provider}`,
        frontendUrl: stateEntry.returnUrl,
        connectorId: stateEntry.connectorId,
      };
    }

    // 4. Mark connector as connected
    await ctx.runMutation(internal.connectors.crud.markConnectedInternal, {
      id: stateEntry.connectorId,
    });

    await auditLog.log(ctx, {
      action: "connector.connected",
      actorId: stateEntry.userId,
      resourceType: ResourceTypes.CONNECTOR,
      resourceId: stateEntry.connectorId,
      metadata: { provider, via: "oauth_callback" },
      severity: "info",
    });

    return {
      error: null,
      frontendUrl: stateEntry.returnUrl,
      connectorId: stateEntry.connectorId,
    };
  },
});
