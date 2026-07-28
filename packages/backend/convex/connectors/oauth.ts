import { generateCodeVerifier, generateState, type OAuth2Tokens } from "arctic";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { authAction } from "../auth";
import { auditLog, ResourceTypes } from "../auditLog";
import {
  createGoogleOAuth,
  createNotionOAuth,
  oauthScopeString,
  oauthTokenType,
} from "../lib/arcticOAuth";
import { decryptToken, encryptToken, getEnvOrThrow } from "../lib/crypto";
import {
  GOOGLE_OAUTH_SCOPES,
  pickGoogleTokenConnectorId,
  scopeIncludesDrive,
} from "../neo4jActions/connectors/googleShared";

type ConnectorOAuthProvider = "google_drive" | "notion";

function isConnectorOAuthProvider(
  value: string,
): value is ConnectorOAuthProvider {
  return value === "google_drive" || value === "notion";
}

async function revokeTokenBestEffort(
  revoke: () => Promise<unknown>,
): Promise<void> {
  try {
    await revoke();
  } catch {
    // best-effort, continue even if revocation fails
  }
}

type StoreOAuthTokensOptions = {
  refreshToken: string;
  expiresAt: number;
};

function googleTokenPolicy(tokens: OAuth2Tokens): StoreOAuthTokensOptions {
  return {
    refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : "",
    expiresAt: tokens.accessTokenExpiresAt().getTime(),
  };
}

function notionTokenPolicy(): StoreOAuthTokensOptions {
  return { refreshToken: "", expiresAt: 0 };
}

async function encryptAndStoreOAuthTokens(
  ctx: ActionCtx,
  connectorId: Id<"connectors">,
  tokens: OAuth2Tokens,
  options: StoreOAuthTokensOptions,
): Promise<void> {
  const encryptedAccess = await encryptToken(tokens.accessToken());
  const encryptedRefresh = await encryptToken(options.refreshToken);
  await ctx.runMutation(internal.connectors.tokens.storeTokensInternal, {
    connectorId,
    accessToken: encryptedAccess,
    refreshToken: encryptedRefresh,
    expiresAt: options.expiresAt,
    tokenType: oauthTokenType(tokens),
    scope: oauthScopeString(tokens),
  });
}

function connectorCallbackRedirectUri(): string {
  return `${getEnvOrThrow("CONVEX_SITE_URL")}/api/auth/connector/callback`;
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

    const state = generateState();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    const redirectUri = connectorCallbackRedirectUri();

    if (provider === "google_drive") {
      const codeVerifier = generateCodeVerifier();
      await ctx.runMutation(internal.oauthState.insertOAuthStateInternal, {
        state,
        userId: ctx.userId,
        returnUrl: args.returnUrl,
        expiresAt,
        connectorId: args.connectorId,
        provider,
        codeVerifier,
      });

      const authUrl = createGoogleOAuth(redirectUri).createAuthorizationURL(
        state,
        codeVerifier,
        [...GOOGLE_OAUTH_SCOPES],
      );
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      return { authUrl: authUrl.toString(), alreadyConnected: false };
    }

    await ctx.runMutation(internal.oauthState.insertOAuthStateInternal, {
      state,
      userId: ctx.userId,
      returnUrl: args.returnUrl,
      expiresAt,
      connectorId: args.connectorId,
      provider,
    });

    const authUrl =
      createNotionOAuth(redirectUri).createAuthorizationURL(state);
    return { authUrl: authUrl.toString(), alreadyConnected: false };
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

    if (tokens && connector.provider === "google_drive") {
      await revokeTokenBestEffort(async () => {
        const accessToken = await decryptToken(tokens.accessToken);
        await createGoogleOAuth(connectorCallbackRedirectUri()).revokeToken(
          accessToken,
        );
      });
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
    const redirectUri = connectorCallbackRedirectUri();
    const fail = (error: string): OAuthCallbackResult =>
      oauthCallbackError(error, stateEntry.returnUrl, connectorId);

    let tokens: OAuth2Tokens;
    try {
      if (provider === "google_drive") {
        if (!stateEntry.codeVerifier) {
          return fail("invalid_state");
        }
        tokens = await createGoogleOAuth(redirectUri).validateAuthorizationCode(
          args.code,
          stateEntry.codeVerifier,
        );
      } else {
        tokens = await createNotionOAuth(redirectUri).validateAuthorizationCode(
          args.code,
        );
      }
    } catch {
      return fail("token_exchange_failed");
    }

    await encryptAndStoreOAuthTokens(
      ctx,
      connectorId,
      tokens,
      provider === "google_drive"
        ? googleTokenPolicy(tokens)
        : notionTokenPolicy(),
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
