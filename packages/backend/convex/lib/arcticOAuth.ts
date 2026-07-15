import { GitHub, Google, Notion, type OAuth2Tokens } from "arctic";
import { getEnvOrThrow } from "./crypto";

export function createGoogleOAuth(redirectURI: string): Google {
  return new Google(
    getEnvOrThrow("GOOGLE_CLIENT_ID"),
    getEnvOrThrow("GOOGLE_CLIENT_SECRET"),
    redirectURI,
  );
}

export function createNotionOAuth(redirectURI: string): Notion {
  return new Notion(
    getEnvOrThrow("NOTION_CLIENT_ID"),
    getEnvOrThrow("NOTION_CLIENT_SECRET"),
    redirectURI,
  );
}

export function createGitHubOAuth(redirectURI: string | null): GitHub {
  return new GitHub(
    getEnvOrThrow("GITHUB_CLIENT_ID"),
    getEnvOrThrow("GITHUB_CLIENT_SECRET"),
    redirectURI,
  );
}

export function oauthTokenType(tokens: OAuth2Tokens): string {
  if (
    "token_type" in tokens.data &&
    typeof tokens.data.token_type === "string"
  ) {
    return tokens.data.token_type;
  }
  return "Bearer";
}

export function oauthScopeString(tokens: OAuth2Tokens): string {
  return tokens.hasScopes() ? tokens.scopes().join(" ") : "";
}
