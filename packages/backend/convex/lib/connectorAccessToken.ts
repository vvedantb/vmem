import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { decryptToken, encryptToken, getEnvOrThrow } from "./crypto";
import { pickGoogleTokenConnectorId } from "../neo4jActions/connectors/googleShared";

interface RefreshResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
}

export type ConnectorAccessTokenResult =
  | { ok: true; accessToken: string; tokenConnectorId: Id<"connectors"> }
  | { ok: false; message: string };

export async function resolveConnectorAccessToken(
  ctx: ActionCtx,
  connector: Doc<"connectors">,
): Promise<ConnectorAccessTokenResult> {
  if (!connector.provider) {
    return { ok: false, message: "Connector does not support sync" };
  }

  let tokenConnectorId = connector._id;
  if (connector.provider === "google_drive" || connector.provider === "gmail") {
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

  const usesRefresh =
    connector.provider === "google_drive" ||
    connector.provider === "gmail" ||
    connector.provider === "onedrive";

  if (usesRefresh && tokens.expiresAt < Date.now()) {
    if (!tokens.refreshToken) {
      return {
        ok: false,
        message: "Token expired and no refresh token — please reconnect",
      };
    }

    const refreshToken = await decryptToken(tokens.refreshToken);

    let refreshUrl: string;
    let clientId: string;
    let clientSecret: string;
    if (
      connector.provider === "google_drive" ||
      connector.provider === "gmail"
    ) {
      refreshUrl = "https://oauth2.googleapis.com/token";
      clientId = getEnvOrThrow("GOOGLE_CLIENT_ID");
      clientSecret = getEnvOrThrow("GOOGLE_CLIENT_SECRET");
    } else {
      refreshUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
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
      await ctx.runMutation(internal.connectors.crud.markDisconnectedInternal, {
        id: tokenConnectorId,
      });
      await ctx.runMutation(internal.connectors.tokens.deleteTokensInternal, {
        connectorId: tokenConnectorId,
      });
      return { ok: false, message: "Token refresh failed — please reconnect" };
    }

    const refreshData: RefreshResponse = await refreshRes.json();
    if (!refreshData.access_token) {
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
