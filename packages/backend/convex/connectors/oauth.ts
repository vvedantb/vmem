import { v } from "convex/values";
import type { z } from "zod";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { authAction } from "../auth";
import { auditLog, ResourceTypes } from "../auditLog";
import { encryptToken, decryptToken, getEnvOrThrow } from "../lib/crypto";
import {
  oauthAccessTokenSchema,
  safeParseResponseJson,
} from "../lib/jsonBoundary";
import {
  GOOGLE_OAUTH_SCOPES,
  pickGoogleTokenConnectorId,
  scopeIncludesDrive,
} from "../neo4jActions/connectors/googleShared";

type Provider = NonNullable<Doc<"connectors">["provider"]>;

interface ProviderConfig {
  authUrl: string;
  tokenUrl: string;
  revokeUrl: string | null;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  extraAuthParams: Record<string, string>;
  tokenAuth: "body" | "basic";
  includeScopeInTokenBody: boolean;
  tokenPolicy: (tokenData: OAuthAccessTokenData) => StoreOAuthTokensOptions;
}

function expiringTokenPolicy(
  tokenData: OAuthAccessTokenData,
): StoreOAuthTokensOptions {
  return {
    refreshToken: tokenData.refresh_token ?? "",
    expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  };
}

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
      throw new Error("Connector does not support OAuth");
    }

    if (!isConnectorOAuthProvider(connector.provider)) {
      throw new Error(`Unsupported provider: ${String(connector.provider)}`);
    }
    const provider = connector.provider;
    const config = PROVIDER_CONFIGS[provider];
    const convexSiteUrl = getEnvOrThrow("CONVEX_SITE_URL");

    if (provider === "google_drive") {
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
        if (tokens !== null && scopeIncludesDrive(tokens.scope)) {
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

export const disconnect = authAction({
  args: { connectorId: v.id("connectors") },
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

    const tokens = await ctx.runQuery(
      internal.connectors.tokens.getEncryptedTokensInternal,
      { connectorId: args.connectorId },
    );

    if (
      tokens &&
      connector.provider &&
      isConnectorOAuthProvider(connector.provider)
    ) {
      const revokeUrl = PROVIDER_CONFIGS[connector.provider].revokeUrl;
      if (revokeUrl) {
        await revokeTokenBestEffort(async () => {
          const accessToken = await decryptToken(tokens.accessToken);
          await fetch(`${revokeUrl}?token=${encodeURIComponent(accessToken)}`, {
            method: "POST",
          });
        });
      }
    }

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
