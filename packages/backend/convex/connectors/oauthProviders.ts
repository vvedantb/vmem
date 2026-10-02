import type { OAuth2Tokens } from "arctic";
import type { Doc } from "../_generated/dataModel";
import {
  createFigmaOAuth,
  createGitHubOAuth,
  createGoogleOAuth,
  createNotionOAuth,
} from "../lib/arcticOAuth";
import { getEnvOrThrow } from "../lib/crypto";
import { GMAIL_OAUTH_SCOPES, GOOGLE_OAUTH_SCOPES } from "./googleShared";

// pure provider policy for connector oauth, kept free of convex ctx so tests can import it

export type ConnectorOAuthProvider = NonNullable<Doc<"connectors">["provider"]>;

const CONNECTOR_OAUTH_PROVIDERS: ReadonlySet<string> =
  new Set<ConnectorOAuthProvider>([
    "google_drive",
    "notion",
    "gmail",
    "figma",
    "github",
  ]);

// figma deprecated projects:read in favour of folders:read for team folder and file listing
export const FIGMA_OAUTH_SCOPES = [
  "current_user:read",
  "file_content:read",
  "file_comments:read",
  "folders:read",
];

// repo is the narrowest classic oauth scope that exposes private repo issues and prs
export const GITHUB_OAUTH_SCOPES = ["read:user", "repo"];

export function isConnectorOAuthProvider(
  value: string,
): value is ConnectorOAuthProvider {
  return CONNECTOR_OAUTH_PROVIDERS.has(value);
}

export function isGoogleConnectorProvider(
  provider: ConnectorOAuthProvider,
): provider is "google_drive" | "gmail" {
  return provider === "google_drive" || provider === "gmail";
}

export function providerUsesPkce(provider: ConnectorOAuthProvider): boolean {
  return isGoogleConnectorProvider(provider);
}

export function buildConnectorAuthorizationUrl(
  provider: ConnectorOAuthProvider,
  params: { redirectUri: string; state: string; codeVerifier?: string },
): URL {
  switch (provider) {
    case "google_drive":
    case "gmail": {
      if (!params.codeVerifier) {
        throw new Error("Google OAuth requires a PKCE code verifier");
      }
      const scopes =
        provider === "gmail" ? GMAIL_OAUTH_SCOPES : GOOGLE_OAUTH_SCOPES;
      const url = createGoogleOAuth(params.redirectUri).createAuthorizationURL(
        params.state,
        params.codeVerifier,
        [...scopes],
      );
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      return url;
    }
    case "notion":
      return createNotionOAuth(params.redirectUri).createAuthorizationURL(
        params.state,
      );
    case "figma":
      return createFigmaOAuth(params.redirectUri).createAuthorizationURL(
        params.state,
        [...FIGMA_OAUTH_SCOPES],
      );
    case "github":
      return createGitHubOAuth(params.redirectUri).createAuthorizationURL(
        params.state,
        [...GITHUB_OAUTH_SCOPES],
      );
  }
}

export async function exchangeConnectorAuthorizationCode(
  provider: ConnectorOAuthProvider,
  params: { redirectUri: string; code: string; codeVerifier?: string },
): Promise<OAuth2Tokens> {
  switch (provider) {
    case "google_drive":
    case "gmail":
      if (!params.codeVerifier) {
        throw new Error("Google OAuth requires a PKCE code verifier");
      }
      return createGoogleOAuth(params.redirectUri).validateAuthorizationCode(
        params.code,
        params.codeVerifier,
      );
    case "notion":
      return createNotionOAuth(params.redirectUri).validateAuthorizationCode(
        params.code,
      );
    case "figma":
      return createFigmaOAuth(params.redirectUri).validateAuthorizationCode(
        params.code,
      );
    case "github":
      return createGitHubOAuth(params.redirectUri).validateAuthorizationCode(
        params.code,
      );
  }
}

export type StoreOAuthTokensOptions = {
  refreshToken: string;
  expiresAt: number;
};

function hasExpiresIn(tokens: OAuth2Tokens): boolean {
  return (
    "expires_in" in tokens.data && typeof tokens.data.expires_in === "number"
  );
}

// expiresAt 0 means the access token does not expire (notion, github oauth apps)
export function connectorTokenPolicy(
  provider: ConnectorOAuthProvider,
  tokens: OAuth2Tokens,
): StoreOAuthTokensOptions {
  switch (provider) {
    case "google_drive":
    case "gmail":
      return {
        refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : "",
        expiresAt: tokens.accessTokenExpiresAt().getTime(),
      };
    case "notion":
      return { refreshToken: "", expiresAt: 0 };
    case "figma":
    case "github":
      return {
        refreshToken: tokens.hasRefreshToken() ? tokens.refreshToken() : "",
        expiresAt: hasExpiresIn(tokens)
          ? tokens.accessTokenExpiresAt().getTime()
          : 0,
      };
  }
}

export function tokenNeedsRefresh(
  provider: ConnectorOAuthProvider,
  expiresAt: number,
  now: number,
): boolean {
  switch (provider) {
    case "google_drive":
    case "gmail":
      return expiresAt < now;
    case "notion":
      return false;
    case "figma":
    case "github":
      return expiresAt > 0 && expiresAt < now;
  }
}

export async function refreshConnectorAccessToken(
  provider: ConnectorOAuthProvider,
  params: { redirectUri: string; refreshToken: string },
): Promise<OAuth2Tokens> {
  switch (provider) {
    case "google_drive":
    case "gmail":
      return createGoogleOAuth(params.redirectUri).refreshAccessToken(
        params.refreshToken,
      );
    case "figma":
      return createFigmaOAuth(params.redirectUri).refreshAccessToken(
        params.refreshToken,
      );
    case "github":
      return createGitHubOAuth(params.redirectUri).refreshAccessToken(
        params.refreshToken,
      );
    case "notion":
      throw new Error("Notion tokens do not support refresh");
  }
}

async function revokeGitHubGrant(accessToken: string): Promise<void> {
  const clientId = getEnvOrThrow("GITHUB_CLIENT_ID");
  const clientSecret = getEnvOrThrow("GITHUB_CLIENT_SECRET");
  const response = await fetch(
    `https://api.github.com/applications/${encodeURIComponent(clientId)}/grant`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ access_token: accessToken }),
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`GitHub grant revoke failed: ${response.status}`);
  }
}

// notion and figma have no documented revoke endpoint, tokens are just deleted
export async function revokeConnectorAccessToken(
  provider: ConnectorOAuthProvider,
  params: { redirectUri: string; accessToken: string },
): Promise<void> {
  switch (provider) {
    case "google_drive":
    case "gmail":
      await createGoogleOAuth(params.redirectUri).revokeToken(
        params.accessToken,
      );
      return;
    case "github":
      await revokeGitHubGrant(params.accessToken);
      return;
    case "notion":
    case "figma":
      return;
  }
}
