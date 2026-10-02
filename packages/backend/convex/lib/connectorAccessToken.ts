import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { oauthTokenType } from "./arcticOAuth";
import { decryptToken, encryptToken, getEnvOrThrow } from "./crypto";
import { pickGoogleTokenConnectorId } from "../connectors/googleShared";
import {
  refreshConnectorAccessToken,
  tokenNeedsRefresh,
} from "../connectors/oauthProviders";

type ConnectorAccessTokenResult =
  | { ok: true; accessToken: string; tokenConnectorId: Id<"connectors"> }
  | { ok: false; message: string };

// only drive looks up a shared google token row, gmail keeps its own row
function sharesGoogleTokenRow(
  provider: Doc<"connectors">["provider"],
): provider is "google_drive" {
  return provider === "google_drive";
}

function connectorCallbackRedirectUri(): string {
  return `${getEnvOrThrow("CONVEX_SITE_URL")}/api/auth/connector/callback`;
}

export async function resolveConnectorAccessToken(
  ctx: ActionCtx,
  connector: Doc<"connectors">,
): Promise<ConnectorAccessTokenResult> {
  if (!connector.provider) {
    return { ok: false, message: "Connector does not support sync" };
  }

  const provider = connector.provider;
  let tokenConnectorId = connector._id;
  if (sharesGoogleTokenRow(provider)) {
    const googleRows = await ctx.runQuery(
      internal.connectors.crud.listGoogleConnectorsForUserInternal,
      { userId: connector.userId },
    );
    const picked = pickGoogleTokenConnectorId(googleRows, provider);
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

  // google (drive, gmail), figma and expiring github tokens refresh, notion never expires
  if (tokenNeedsRefresh(provider, tokens.expiresAt, Date.now())) {
    if (!tokens.refreshToken) {
      return {
        ok: false,
        message: "Token expired and no refresh token — please reconnect",
      };
    }

    const refreshToken = await decryptToken(tokens.refreshToken);

    let refreshed;
    try {
      refreshed = await refreshConnectorAccessToken(provider, {
        redirectUri: connectorCallbackRedirectUri(),
        refreshToken,
      });
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
