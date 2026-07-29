import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createGoogleOAuth, oauthTokenType } from "./arcticOAuth";
import { decryptToken, encryptToken, getEnvOrThrow } from "./crypto";
import { pickGoogleTokenConnectorId } from "../neo4jActions/connectors/googleShared";

type ConnectorAccessTokenResult =
  | { ok: true; accessToken: string; tokenConnectorId: Id<"connectors"> }
  | { ok: false; message: string };

function isGoogleProvider(
  provider: Doc<"connectors">["provider"],
): provider is "google_drive" {
  return provider === "google_drive";
}

function googleCallbackRedirectUri(): string {
  return `${getEnvOrThrow("CONVEX_SITE_URL")}/api/auth/connector/callback`;
}

export async function resolveConnectorAccessToken(
  ctx: ActionCtx,
  connector: Doc<"connectors">,
): Promise<ConnectorAccessTokenResult> {
  if (!connector.provider) {
    return { ok: false, message: "Connector does not support sync" };
  }

  let tokenConnectorId = connector._id;
  if (isGoogleProvider(connector.provider)) {
    const googleRows = await ctx.runQuery(
      internal.connectors.crud.listGoogleConnectorsForUserInternal,
      { userId: connector.userId },
    );
    const picked = pickGoogleTokenConnectorId(googleRows, connector.provider);
    if (!picked) {
      return { ok: false, message: "No tokens found — please reconnect" };
    }
    tokenConnectorId = picked;
  }

  const tokens = await ctx.runQuery(
    internal.connectors.tokens.getEncryptedTokensInternal,
    { connectorId: tokenConnectorId },
  );
  if (!tokens) {
    return { ok: false, message: "No tokens found — please reconnect" };
  }

  let accessToken = await decryptToken(tokens.accessToken);

  // google is the only provider that issues refreshable oauth tokens
  if (isGoogleProvider(connector.provider) && tokens.expiresAt < Date.now()) {
    if (!tokens.refreshToken) {
      return {
        ok: false,
        message: "Token expired and no refresh token — please reconnect",
      };
    }

    const refreshToken = await decryptToken(tokens.refreshToken);

    let refreshed;
    try {
      refreshed = await createGoogleOAuth(
        googleCallbackRedirectUri(),
      ).refreshAccessToken(refreshToken);
    } catch {
      await ctx.runMutation(internal.connectors.crud.markDisconnectedInternal, {
        id: tokenConnectorId,
      });
      await ctx.runMutation(internal.connectors.tokens.deleteTokensInternal, {
        connectorId: tokenConnectorId,
      });
      return { ok: false, message: "Token refresh failed — please reconnect" };
    }

    const encryptedAccess = await encryptToken(refreshed.accessToken());
    const encryptedRefresh = refreshed.hasRefreshToken()
      ? await encryptToken(refreshed.refreshToken())
      : tokens.refreshToken;

    await ctx.runMutation(internal.connectors.tokens.storeTokensInternal, {
      connectorId: tokenConnectorId,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt: refreshed.accessTokenExpiresAt().getTime(),
      tokenType: oauthTokenType(refreshed),
      scope: tokens.scope,
    });

    accessToken = refreshed.accessToken();
  }

  return { ok: true, accessToken, tokenConnectorId };
}
