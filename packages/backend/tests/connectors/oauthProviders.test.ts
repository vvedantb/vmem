import { OAuth2Tokens } from "arctic";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildConnectorAuthorizationUrl,
  connectorTokenPolicy,
  exchangeConnectorAuthorizationCode,
  FIGMA_OAUTH_SCOPES,
  GITHUB_OAUTH_SCOPES,
  isConnectorOAuthProvider,
  providerUsesPkce,
  revokeConnectorAccessToken,
  tokenNeedsRefresh,
} from "../../convex/connectors/oauthProviders";
import { jsonResponse } from "./helpers";

const REDIRECT_URI = "https://example.convex.site/api/auth/connector/callback";
const STATE = "state_123";
const CODE_VERIFIER = "verifier_abcdefghijklmnopqrstuvwxyz0123456789";

type CapturedRequest = { url: string; method: string; body: string };

function stubFetch(body: unknown, status = 200): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const request = new Request(input, init);
      captured.push({
        url: request.url,
        method: request.method,
        body: await request.text(),
      });
      return jsonResponse(body, { status });
    }),
  );
  return captured;
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "google-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-secret");
  vi.stubEnv("NOTION_CLIENT_ID", "notion-client");
  vi.stubEnv("NOTION_CLIENT_SECRET", "notion-secret");
  vi.stubEnv("FIGMA_CLIENT_ID", "figma-client");
  vi.stubEnv("FIGMA_CLIENT_SECRET", "figma-secret");
  vi.stubEnv("GITHUB_CLIENT_ID", "github-client");
  vi.stubEnv("GITHUB_CLIENT_SECRET", "github-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isConnectorOAuthProvider", () => {
  it("accepts every wired provider", () => {
    for (const provider of [
      "google_drive",
      "notion",
      "gmail",
      "figma",
      "github",
    ]) {
      expect(isConnectorOAuthProvider(provider)).toBe(true);
    }
  });

  it("rejects unsupported providers", () => {
    expect(isConnectorOAuthProvider("slack")).toBe(false);
    expect(isConnectorOAuthProvider("")).toBe(false);
    expect(isConnectorOAuthProvider("GITHUB")).toBe(false);
  });

  it("uses pkce only for google providers", () => {
    expect(providerUsesPkce("google_drive")).toBe(true);
    expect(providerUsesPkce("gmail")).toBe(true);
    expect(providerUsesPkce("notion")).toBe(false);
    expect(providerUsesPkce("figma")).toBe(false);
    expect(providerUsesPkce("github")).toBe(false);
  });
});

describe("buildConnectorAuthorizationUrl", () => {
  it("builds a gmail url with only the gmail.readonly scope", () => {
    const url = buildConnectorAuthorizationUrl("gmail", {
      redirectUri: REDIRECT_URI,
      state: STATE,
      codeVerifier: CODE_VERIFIER,
    });
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/gmail.readonly",
    );
    expect(url.searchParams.get("scope")).not.toContain("drive");
    expect(url.searchParams.get("client_id")).toBe("google-client");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe(STATE);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("keeps google drive on the drive.readonly scope", () => {
    const url = buildConnectorAuthorizationUrl("google_drive", {
      redirectUri: REDIRECT_URI,
      state: STATE,
      codeVerifier: CODE_VERIFIER,
    });
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/drive.readonly",
    );
  });

  it("requires a code verifier for google providers", () => {
    expect(() =>
      buildConnectorAuthorizationUrl("gmail", {
        redirectUri: REDIRECT_URI,
        state: STATE,
      }),
    ).toThrow(/code verifier/);
  });

  it("builds a figma url with read scopes and no pkce", () => {
    const url = buildConnectorAuthorizationUrl("figma", {
      redirectUri: REDIRECT_URI,
      state: STATE,
    });
    expect(`${url.origin}${url.pathname}`).toBe("https://www.figma.com/oauth");
    expect(url.searchParams.get("scope")).toBe(FIGMA_OAUTH_SCOPES.join(" "));
    expect(url.searchParams.get("scope")).toContain("file_content:read");
    expect(url.searchParams.get("scope")).toContain("file_comments:read");
    expect(url.searchParams.get("client_id")).toBe("figma-client");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe(STATE);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.has("code_challenge")).toBe(false);
  });

  it("builds a github url with read:user and repo", () => {
    const url = buildConnectorAuthorizationUrl("github", {
      redirectUri: REDIRECT_URI,
      state: STATE,
    });
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("scope")).toBe("read:user repo");
    expect(GITHUB_OAUTH_SCOPES).toEqual(["read:user", "repo"]);
    expect(url.searchParams.get("client_id")).toBe("github-client");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe(STATE);
  });

  it("errors when provider env is missing", () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    expect(() =>
      buildConnectorAuthorizationUrl("github", {
        redirectUri: REDIRECT_URI,
        state: STATE,
      }),
    ).toThrow(/GITHUB_CLIENT_ID/);
  });
});

describe("exchangeConnectorAuthorizationCode", () => {
  it("exchanges a gmail code with the pkce verifier", async () => {
    const captured = stubFetch({
      access_token: "gmail-access",
      refresh_token: "gmail-refresh",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
    });
    const tokens = await exchangeConnectorAuthorizationCode("gmail", {
      redirectUri: REDIRECT_URI,
      code: "auth-code",
      codeVerifier: CODE_VERIFIER,
    });
    expect(tokens.accessToken()).toBe("gmail-access");
    expect(captured[0]?.url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(captured[0]?.body);
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe(CODE_VERIFIER);
    expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
  });

  it("rejects a google exchange without a verifier", async () => {
    await expect(
      exchangeConnectorAuthorizationCode("gmail", {
        redirectUri: REDIRECT_URI,
        code: "auth-code",
      }),
    ).rejects.toThrow(/code verifier/);
  });

  it("exchanges a figma code against the figma token endpoint", async () => {
    const captured = stubFetch({
      access_token: "figma-access",
      refresh_token: "figma-refresh",
      expires_in: 7_776_000,
      user_id_string: "123",
    });
    const tokens = await exchangeConnectorAuthorizationCode("figma", {
      redirectUri: REDIRECT_URI,
      code: "figma-code",
    });
    expect(tokens.accessToken()).toBe("figma-access");
    expect(captured[0]?.url).toBe("https://api.figma.com/v1/oauth/token");
    expect(new URLSearchParams(captured[0]?.body).get("code")).toBe(
      "figma-code",
    );
  });

  it("exchanges a github code against the github token endpoint", async () => {
    const captured = stubFetch({
      access_token: "gho_test",
      token_type: "bearer",
      scope: "read:user,repo",
    });
    const tokens = await exchangeConnectorAuthorizationCode("github", {
      redirectUri: REDIRECT_URI,
      code: "github-code",
    });
    expect(tokens.accessToken()).toBe("gho_test");
    expect(captured[0]?.url).toBe(
      "https://github.com/login/oauth/access_token",
    );
  });

  it("surfaces provider token errors so the callback can fail", async () => {
    stubFetch({ error: "bad_verification_code" }, 400);
    await expect(
      exchangeConnectorAuthorizationCode("github", {
        redirectUri: REDIRECT_URI,
        code: "stale",
      }),
    ).rejects.toThrow();
  });
});

describe("connectorTokenPolicy", () => {
  const now = Date.now();

  it("stores gmail refresh tokens and expiry like drive", () => {
    const tokens = new OAuth2Tokens({
      access_token: "a",
      refresh_token: "r",
      expires_in: 3600,
    });
    const policy = connectorTokenPolicy("gmail", tokens);
    expect(policy.refreshToken).toBe("r");
    expect(policy.expiresAt).toBeGreaterThanOrEqual(now + 3_599_000);
  });

  it("stores figma refresh tokens and expiry", () => {
    const tokens = new OAuth2Tokens({
      access_token: "a",
      refresh_token: "r",
      expires_in: 7_776_000,
    });
    const policy = connectorTokenPolicy("figma", tokens);
    expect(policy.refreshToken).toBe("r");
    expect(policy.expiresAt).toBeGreaterThan(now);
  });

  it("treats github oauth app tokens as non-expiring", () => {
    const tokens = new OAuth2Tokens({ access_token: "gho", scope: "repo" });
    expect(connectorTokenPolicy("github", tokens)).toEqual({
      refreshToken: "",
      expiresAt: 0,
    });
  });

  it("keeps github refresh tokens when arctic returns them", () => {
    const tokens = new OAuth2Tokens({
      access_token: "ghu",
      refresh_token: "ghr",
      expires_in: 28_800,
    });
    const policy = connectorTokenPolicy("github", tokens);
    expect(policy.refreshToken).toBe("ghr");
    expect(policy.expiresAt).toBeGreaterThan(now);
  });

  it("keeps the notion policy unchanged", () => {
    const tokens = new OAuth2Tokens({ access_token: "secret_x" });
    expect(connectorTokenPolicy("notion", tokens)).toEqual({
      refreshToken: "",
      expiresAt: 0,
    });
  });
});

describe("tokenNeedsRefresh", () => {
  const now = 1_000_000;

  it("refreshes expired google tokens", () => {
    expect(tokenNeedsRefresh("gmail", now - 1, now)).toBe(true);
    expect(tokenNeedsRefresh("google_drive", now - 1, now)).toBe(true);
    expect(tokenNeedsRefresh("gmail", now + 1, now)).toBe(false);
  });

  it("refreshes figma and github only when an expiry is stored", () => {
    expect(tokenNeedsRefresh("figma", now - 1, now)).toBe(true);
    expect(tokenNeedsRefresh("github", now - 1, now)).toBe(true);
    expect(tokenNeedsRefresh("github", 0, now)).toBe(false);
    expect(tokenNeedsRefresh("figma", 0, now)).toBe(false);
  });

  it("never refreshes notion", () => {
    expect(tokenNeedsRefresh("notion", 0, now)).toBe(false);
  });
});

describe("revokeConnectorAccessToken", () => {
  it("revokes gmail tokens with google", async () => {
    const captured = stubFetch({});
    await revokeConnectorAccessToken("gmail", {
      redirectUri: REDIRECT_URI,
      accessToken: "gmail-access",
    });
    expect(captured[0]?.url).toBe("https://oauth2.googleapis.com/revoke");
  });

  it("deletes the github grant for the token", async () => {
    const captured = stubFetch({});
    await revokeConnectorAccessToken("github", {
      redirectUri: REDIRECT_URI,
      accessToken: "gho_test",
    });
    expect(captured[0]?.method).toBe("DELETE");
    expect(captured[0]?.url).toBe(
      "https://api.github.com/applications/github-client/grant",
    );
    expect(captured[0]?.body).toBe(
      JSON.stringify({ access_token: "gho_test" }),
    );
  });

  it("skips network revoke for figma and notion", async () => {
    const captured = stubFetch({});
    await revokeConnectorAccessToken("figma", {
      redirectUri: REDIRECT_URI,
      accessToken: "figma-access",
    });
    await revokeConnectorAccessToken("notion", {
      redirectUri: REDIRECT_URI,
      accessToken: "secret_x",
    });
    expect(captured).toHaveLength(0);
  });
});
