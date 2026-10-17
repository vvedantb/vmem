import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMcpOAuthProvider,
  hasMcpOAuthTokens,
  isAccessTokenExpiring,
  type McpOAuthState,
  type McpOAuthStorage,
} from "../src/mcp-oauth";

function memoryStorage(initial?: McpOAuthState): McpOAuthStorage & {
  current: McpOAuthState | undefined;
} {
  const storage = {
    current: initial,
    load: () => storage.current,
    save: (state: McpOAuthState | undefined) => {
      storage.current = state;
    },
  };
  return storage;
}

const tokens = { access_token: "a", token_type: "Bearer", refresh_token: "r" };

describe("OAuth provider storage", () => {
  it("saves and loads tokens and stamps when they were obtained", async () => {
    const storage = memoryStorage();
    const provider = createMcpOAuthProvider({ storage, now: () => 5000 });
    await provider.saveTokens(tokens);
    assert.equal((await provider.tokens())?.access_token, "a");
    assert.equal(storage.current?.tokens?.obtained_at, 5000);
    assert.equal(hasMcpOAuthTokens(storage.current), true);
  });

  it("registers as vmem with PKCE-friendly public client settings", () => {
    const provider = createMcpOAuthProvider({
      storage: memoryStorage(),
      redirectUrl: "http://127.0.0.1:1111/callback",
      redirectToAuthorization: () => undefined,
    });
    assert.equal(provider.clientMetadata.client_name, "vmem");
    assert.deepEqual(provider.clientMetadata.redirect_uris, [
      "http://127.0.0.1:1111/callback",
    ]);
    assert.equal(provider.clientMetadata.token_endpoint_auth_method, "none");
  });

  it("drops client information registered for another redirect", async () => {
    const storage = memoryStorage({
      clientInformation: {
        client_id: "c",
        redirect_uris: ["http://127.0.0.1:1111/callback"],
      },
    });
    const same = createMcpOAuthProvider({
      storage,
      redirectUrl: "http://127.0.0.1:1111/callback",
      redirectToAuthorization: () => undefined,
    });
    assert.equal((await same.clientInformation())?.client_id, "c");
    const other = createMcpOAuthProvider({
      storage,
      redirectUrl: "http://127.0.0.1:2222/callback",
      redirectToAuthorization: () => undefined,
    });
    assert.equal(await other.clientInformation(), undefined);
  });

  it("keeps stored client information for a refresh-only provider", async () => {
    const storage = memoryStorage({
      clientInformation: {
        client_id: "c",
        redirect_uris: ["http://127.0.0.1:1/callback"],
      },
    });
    const provider = createMcpOAuthProvider({ storage });
    assert.equal((await provider.clientInformation())?.client_id, "c");
    assert.throws(() =>
      provider.redirectToAuthorization(new URL("https://x.test")),
    );
  });

  it("clears by scope", async () => {
    const storage = memoryStorage({
      tokens,
      clientInformation: { client_id: "c" },
    });
    const provider = createMcpOAuthProvider({ storage });
    await provider.invalidateCredentials?.("tokens");
    assert.equal(storage.current?.tokens, undefined);
    assert.equal(storage.current?.clientInformation?.client_id, "c");
    await provider.invalidateCredentials?.("all");
    assert.equal(storage.current, undefined);
  });
});

describe("isAccessTokenExpiring", () => {
  const state = (expiresIn: number): McpOAuthState => ({
    tokens: { ...tokens, expires_in: expiresIn, obtained_at: 0 },
  });
  it("is true within two minutes of expiry", () => {
    assert.equal(isAccessTokenExpiring(state(3600), 3_000_000), false);
    assert.equal(isAccessTokenExpiring(state(3600), 3_500_000), true);
  });
  it("treats unknown expiry as live", () => {
    assert.equal(isAccessTokenExpiring({ tokens }, 9e12), false);
    assert.equal(isAccessTokenExpiring(undefined, 9e12), false);
  });
});
