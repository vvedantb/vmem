import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { authAction } from "../auth";
import { encryptToken, decryptToken, getEnvOrThrow } from "../lib/crypto";
import {
  oauthAccessTokenSchema,
  safeParseResponseJson,
} from "../lib/jsonBoundary";
import type { z } from "zod";
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
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Extra params merged into the authorize URL, after `scope` and before `state`. */
  extraAuthParams: Record<string, string>;
  /** How the token endpoint expects client credentials. */
  tokenAuth: "body" | "basic";
  /** Whether the (body-auth) token exchange request also carries `scope`. */
  includeScopeInTokenBody: boolean;
  /** Derives the stored refresh token + expiry from the token response. */
  tokenPolicy: (tokenData: OAuthAccessTokenData) => StoreOAuthTokensOptions;
}

/** access_token/refresh_token pair expires per the provider's expires_in. */
function expiringTokenPolicy(
  tokenData: OAuthAccessTokenData,
): StoreOAuthTokensOptions {
  return {
    refreshToken: tokenData.refresh_token ?? "",
    expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  };
}

/** Provider issues a long-lived/non-expiring token with no refresh token. */
function noExpiryTokenPolicy(): StoreOAuthTokensOptions {
  return { refreshToken: "", expiresAt: 0 };
}

const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  google_drive: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: [...GOOGLE_OAUTH_SCOPES],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    tokenAuth: "body",
    includeScopeInTokenBody: false,
    tokenPolicy: expiringTokenPolicy,
  },
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: [...GOOGLE_OAUTH_SCOPES],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    tokenAuth: "body",
    includeScopeInTokenBody: false,
    tokenPolicy: expiringTokenPolicy,
  },
  notion: {
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    revokeUrl: null,
    scopes: [],
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
    extraAuthParams: { owner: "user" },
    tokenAuth: "basic",
    includeScopeInTokenBody: false,
    tokenPolicy: noExpiryTokenPolicy,
  },
  onedrive: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    revokeUrl: null,
    scopes: ["Files.Read.All", "offline_access"],
    clientIdEnv: "MICROSOFT_CLIENT_ID",
    clientSecretEnv: "MICROSOFT_CLIENT_SECRET",
    extraAuthParams: { response_mode: "query", prompt: "consent" },
    tokenAuth: "body",
    includeScopeInTokenBody: true,
    tokenPolicy: expiringTokenPolicy,
  },
  linear: {
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    revokeUrl: "https://api.linear.app/oauth/revoke",
    scopes: ["read"],
    clientIdEnv: "LINEAR_CLIENT_ID",
    clientSecretEnv: "LINEAR_CLIENT_SECRET",
    extraAuthParams: { prompt: "consent" },
    tokenAuth: "body",
    includeScopeInTokenBody: false,
    tokenPolicy: noExpiryTokenPolicy,
  },
};

function isConnectorOAuthProvider(value: string): value is Provider {
  return value in PROVIDER_CONFIGS;
}

function buildAuthorizeUrl(
  authUrl: string,
  params: Record<string, string>,
): string {
  return `${authUrl}?${new URLSearchParams(params).toString()}`;
}

async function revokeTokenBestEffort(
  revoke: () => Promise<unknown>,
): Promise<void> {
  try {
    await revoke();
  } catch {
    // Best effort — continue even if revocation fails
  }
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
  const tokenData = await safeParseResponseJson(
    tokenRes,
    oauthAccessTokenSchema,
  );
  if (!tokenData) {
    console.error("OAuth token exchange returned an unparseable response");
    return { ok: false, error: "token_exchange_failed" };
  }
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
      throw new Error(`Unsupported provider: ${String(connector.provider)}`);
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
        const hasRequiredScope =
          tokens !== null &&
          (provider === "gmail"
            ? scopeIncludesGmail(tokens.scope)
            : scopeIncludesDrive(tokens.scope));
        if (hasRequiredScope) {
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

    // 3. Build provider auth URL from its config
    const redirectUri = `${convexSiteUrl}/api/auth/connector/callback`;

    return {
      authUrl: buildAuthorizeUrl(config.authUrl, {
        client_id: getEnvOrThrow(config.clientIdEnv),
        redirect_uri: redirectUri,
        response_type: "code",
        ...(config.scopes.length > 0 ? { scope: config.scopes.join(" ") } : {}),
        ...config.extraAuthParams,
        state,
      }),
      alreadyConnected: false,
    };
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
      await revokeTokenBestEffort(async () => {
        const accessToken = await decryptToken(tokens.accessToken);
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
          { method: "POST" },
        );
      });
    }

    if (tokens && connector.provider === "linear") {
      await revokeTokenBestEffort(async () => {
        const accessToken = await decryptToken(tokens.accessToken);
        await fetch("https://api.linear.app/oauth/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ access_token: accessToken }),
        });
      });
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

type OAuthCallbackResult = {
  error: string | null;
  frontendUrl: string | null;
  connectorId: string | null;
};

function oauthCallbackError(
  error: string,
  frontendUrl: string | null,
  connectorId: string | null,
): OAuthCallbackResult {
  return { error, frontendUrl, connectorId };
}

export const handleCallbackInternal = internalAction({
  args: { code: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<OAuthCallbackResult> => {
    // 1. Consume and validate state
    const stateEntry = await ctx.runMutation(
      internal.oauthState.consumeOAuthStateInternal,
      { state: args.state },
    );
    if (!stateEntry) {
      return oauthCallbackError("invalid_state", null, null);
    }
    if (stateEntry.expiresAt < Date.now()) {
      return oauthCallbackError(
        "expired_state",
        stateEntry.returnUrl,
        stateEntry.connectorId ?? null,
      );
    }
    if (!stateEntry.connectorId || !stateEntry.provider) {
      return oauthCallbackError("invalid_state", stateEntry.returnUrl, null);
    }

    if (!isConnectorOAuthProvider(stateEntry.provider)) {
      return oauthCallbackError(
        "invalid_state",
        stateEntry.returnUrl,
        stateEntry.connectorId,
      );
    }

    const provider = stateEntry.provider;
    const connectorId = stateEntry.connectorId;
    const convexSiteUrl = getEnvOrThrow("CONVEX_SITE_URL");
    const redirectUri = `${convexSiteUrl}/api/auth/connector/callback`;
    const fail = (error: string): OAuthCallbackResult =>
      oauthCallbackError(error, stateEntry.returnUrl, connectorId);

    // 2. Exchange code for tokens using the provider's configured auth style
    const config = PROVIDER_CONFIGS[provider];
    const clientId = getEnvOrThrow(config.clientIdEnv);
    const clientSecret = getEnvOrThrow(config.clientSecretEnv);

    const exchanged =
      config.tokenAuth === "basic"
        ? await exchangeOAuthAccessToken(config.tokenUrl, {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              grant_type: "authorization_code",
              code: args.code,
              redirect_uri: redirectUri,
            }),
          })
        : await exchangeOAuthAccessToken(config.tokenUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              code: args.code,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
              ...(config.includeScopeInTokenBody
                ? { scope: config.scopes.join(" ") }
                : {}),
            }),
          });
    if (!exchanged.ok) {
      return fail(exchanged.error);
    }

    await encryptAndStoreOAuthTokens(
      ctx,
      connectorId,
      exchanged.tokenData,
      config.tokenPolicy(exchanged.tokenData),
    );

    // 4. Mark connector as connected
    await ctx.runMutation(internal.connectors.crud.markConnectedInternal, {
      id: connectorId,
    });

    await auditLog.log(ctx, {
      action: "connector.connected",
      actorId: stateEntry.userId,
      resourceType: ResourceTypes.CONNECTOR,
      resourceId: connectorId,
      metadata: { provider, via: "oauth_callback" },
      severity: "info",
    });

    return {
      error: null,
      frontendUrl: stateEntry.returnUrl,
      connectorId,
    };
  },
});
