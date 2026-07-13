import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { decryptToken, encryptToken, getEnvOrThrow } from "./crypto";
import { pickGoogleTokenConnectorId } from "../neo4jActions/connectors/googleShared";
import { oauthAccessTokenSchema, safeParseResponseJson } from "./jsonBoundary";

type ConnectorAccessTokenResult =
  | { ok: true; accessToken: string; tokenConnectorId: Id<"connectors"> }
  | { ok: false; message: string };

function isGoogleProvider(
  provider: Doc<"connectors">["provider"],
): provider is "google_drive" {
  return provider === "google_drive";
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

  // Google is the only provider that issues refreshable OAuth tokens.
  if (isGoogleProvider(connector.provider) && tokens.expiresAt < Date.now()) {
    if (!tokens.refreshToken) {
      return {
        ok: false,
        message: "Token expired and no refresh token — please reconnect",
      };
    }

    const refreshToken = await decryptToken(tokens.refreshToken);
    const refreshUrl = "https://oauth2.googleapis.com/token";
    const clientId = getEnvOrThrow("GOOGLE_CLIENT_ID");
    const clientSecret = getEnvOrThrow("GOOGLE_CLIENT_SECRET");

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
      await ctx.runMutation(internal.connectors.crud.markDisconnectedInternal, {
        id: tokenConnectorId,
      });
      await ctx.runMutation(internal.connectors.tokens.deleteTokensInternal, {
        connectorId: tokenConnectorId,
      });
      return { ok: false, message: "Token refresh failed — please reconnect" };
    }

    const refreshData = await safeParseResponseJson(
      refreshRes,
      oauthAccessTokenSchema,
    );
    if (!refreshData || !refreshData.access_token) {
      console.error("Token refresh returned an unparseable response");
      return { ok: false, message: "Token refresh failed — please reconnect" };
    }

    const encryptedAccess = await encryptToken(refreshData.access_token);
    const encryptedRefresh = refreshData.refresh_token
      ? await encryptToken(refreshData.refresh_token)
      : tokens.refreshToken;

    await ctx.runMutation(internal.connectors.tokens.storeTokensInternal, {
      connectorId: tokenConnectorId,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      expiresAt: Date.now() + (refreshData.expires_in ?? 3600) * 1000,
      tokenType: tokens.tokenType,
      scope: tokens.scope,
    });

    accessToken = refreshData.access_token;
  }

  return { ok: true, accessToken, tokenConnectorId };
}
