import { generateCodeVerifier, generateState, type OAuth2Tokens } from "arctic";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { authAction } from "../auth";
import { auditLog, ResourceTypes } from "../auditLog";
import { oauthScopeString, oauthTokenType } from "../lib/arcticOAuth";
import { decryptToken, encryptToken, getEnvOrThrow } from "../lib/crypto";
import { pickGoogleTokenConnectorId, scopeIncludesDrive } from "./googleShared";
import {
  buildConnectorAuthorizationUrl,
  connectorTokenPolicy,
  exchangeConnectorAuthorizationCode,
  isConnectorOAuthProvider,
  providerUsesPkce,
  revokeConnectorAccessToken,
  type StoreOAuthTokensOptions,
} from "./oauthProviders";

async function revokeTokenBestEffort(
  revoke: () => Promise<unknown>,
): Promise<void> {
  try {
    await revoke();
  } catch {
    // best-effort, continue even if revocation fails
  }
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

// AI-generated (Claude), prompt: "implement connector oauth start and callback with state consume pkce token exchange and encrypted token storage"
// Modified by me: provider specific token policies and audit logging
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

    const codeVerifier = providerUsesPkce(provider)
      ? generateCodeVerifier()
      : undefined;
    await ctx.runMutation(internal.oauthState.insertOAuthStateInternal, {
      state,
      userId: ctx.userId,
      returnUrl: args.returnUrl,
      expiresAt,
      connectorId: args.connectorId,
      provider,
      codeVerifier,
    });

    const authUrl = buildConnectorAuthorizationUrl(provider, {
      redirectUri,
      state,
      codeVerifier,
    });
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

    const provider = connector.provider;
    if (tokens && provider && isConnectorOAuthProvider(provider)) {
      await revokeTokenBestEffort(async () => {
        const accessToken = await decryptToken(tokens.accessToken);
        await revokeConnectorAccessToken(provider, {
          redirectUri: connectorCallbackRedirectUri(),
          accessToken,
        });
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

// AI-generated (Claude), prompt: "implement connector oauth start and callback with state consume pkce token exchange and encrypted token storage"
// Modified by me: provider specific token policies and audit logging
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

    if (providerUsesPkce(provider) && !stateEntry.codeVerifier) {
      return fail("invalid_state");
    }

    let tokens: OAuth2Tokens;
    try {
      tokens = await exchangeConnectorAuthorizationCode(provider, {
        redirectUri,
        code: args.code,
        codeVerifier: stateEntry.codeVerifier,
      });
    } catch {
      return fail("token_exchange_failed");
    }

    await encryptAndStoreOAuthTokens(
      ctx,
      connectorId,
      tokens,
      connectorTokenPolicy(provider, tokens),
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
