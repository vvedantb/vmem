import { requiredEnv } from "@vvedantb/server";
import { Figma, GitHub, Google, Notion, type OAuth2Tokens } from "arctic";

export function createGoogleOAuth(redirectURI: string): Google {
  return new Google(
    requiredEnv("GOOGLE_CLIENT_ID"),
    requiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectURI,
  );
}

export function createNotionOAuth(redirectURI: string): Notion {
  return new Notion(
    requiredEnv("NOTION_CLIENT_ID"),
    requiredEnv("NOTION_CLIENT_SECRET"),
    redirectURI,
  );
}

export function createFigmaOAuth(redirectURI: string): Figma {
  return new Figma(
    requiredEnv("FIGMA_CLIENT_ID"),
    requiredEnv("FIGMA_CLIENT_SECRET"),
    redirectURI,
  );
}

export function createGitHubOAuth(redirectURI: string): GitHub {
  return new GitHub(
    requiredEnv("GITHUB_CLIENT_ID"),
    requiredEnv("GITHUB_CLIENT_SECRET"),
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
