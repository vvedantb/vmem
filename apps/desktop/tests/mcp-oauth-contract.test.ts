import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import {
  CLIENT_NAME,
  authorizeMcpServer,
  createMcpOAuthProvider,
  hasMcpOAuthTokens,
  isAccessTokenExpiring,
  mcpOAuthStateSchema,
  refreshMcpOAuth,
  revokeMcpOAuth,
  type Identity,
  type McpOAuthState,
  type McpOAuthStorage,
} from "../src/mcp-oauth";

// Pins the exact behaviour of the app's OAuth wrapper: stored data, client registration, expiry, refresh and revoke.

type RecordingStorage = McpOAuthStorage & {
  current: McpOAuthState | undefined;
  saves: (McpOAuthState | undefined)[];
};

function memoryStorage(initial?: McpOAuthState): RecordingStorage {
  const storage: RecordingStorage = {
    current: initial,
    saves: [],
    load: () => storage.current,
    save: (state: McpOAuthState | undefined) => {
      storage.saves.push(state);
      storage.current = state;
    },
  };
  return storage;
}

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  hasSignal: boolean;
};

function headerRecord(init: RequestInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(init?.headers).entries());
}

function bodyText(body: RequestInit["body"]): string | undefined {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return undefined;
}

/** A fake fetch: answers by URL and records every request. */
function fakeFetch(
  routes: Record<string, (call: Call) => Response | Promise<Response>>,
): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (input, init) => {
    const url = String(input);
    const call: Call = {
      url,
      method: init?.method ?? "GET",
      headers: headerRecord(init),
      body: bodyText(init?.body),
      hasSignal: init?.signal instanceof AbortSignal,
    };
    calls.push(call);
    const route = routes[url];
    return route ? route(call) : new Response("{}", { status: 404 });
  };
  return { fetch: fetchFn, calls };
}

const json = (status: number, value: object): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Registration answers with the sent metadata plus a client_id, like a real server. */
const jsonObjectSchema = z.object({}).passthrough();
const echoRegistration = (call: Call): Response =>
  json(201, {
    ...jsonObjectSchema.parse(JSON.parse(call.body ?? "{}")),
    client_id: "c",
  });

const AS = "https://as.test";
const MCP = "https://mcp.test/mcp";
const asMetadata = (extra: object = {}) => ({
  issuer: AS,
  authorization_endpoint: `${AS}/authorize`,
  token_endpoint: `${AS}/token`,
  registration_endpoint: `${AS}/register`,
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  ...extra,
});
const discoveryRoutes = (extra: object = {}) => ({
  "https://mcp.test/.well-known/oauth-protected-resource/mcp": () =>
    json(200, { resource: MCP, authorization_servers: [AS] }),
  [`${AS}/.well-known/oauth-authorization-server`]: () =>
    json(200, asMetadata(extra)),
});

describe("contract: constants and schema", () => {
  it("keeps the client name", () => {
    assert.equal(CLIENT_NAME, "vmem");
  });

  it("parses stored state: passthrough tokens and client, strict identity", () => {
    const parsed = mcpOAuthStateSchema.parse({
      tokens: {
        access_token: "a",
        token_type: "Bearer",
        refresh_token: "r",
        expires_in: 60,
        scope: "openid",
        id_token: "i",
        issuer: AS,
        obtained_at: 1,
        extra_token_field: "kept",
      },
      clientInformation: {
        client_id: "c",
        client_secret: "s",
        redirect_uris: ["http://127.0.0.1:1/callback"],
        issuer: AS,
        client_name: "vmem",
      },
      identity: { email: "e@x.test", name: "N", picture: "dropped" },
      unknownTopLevel: "dropped",
    });
    assert.deepEqual(parsed, {
      tokens: {
        access_token: "a",
        token_type: "Bearer",
        refresh_token: "r",
        expires_in: 60,
        scope: "openid",
        id_token: "i",
        issuer: AS,
        obtained_at: 1,
        extra_token_field: "kept",
      },
      clientInformation: {
        client_id: "c",
        client_secret: "s",
        redirect_uris: ["http://127.0.0.1:1/callback"],
        issuer: AS,
        client_name: "vmem",
      },
      identity: { email: "e@x.test", name: "N" },
    });
  });

  it("rejects tokens without token_type and accepts an empty state", () => {
    assert.equal(
      mcpOAuthStateSchema.safeParse({ tokens: { access_token: "a" } }).success,
      false,
    );
    assert.deepEqual(mcpOAuthStateSchema.parse({}), {});
  });

  it("types Identity as optional email and name", () => {
    const identity: Identity = { email: "e", name: "n" };
    assert.deepEqual(identity, { email: "e", name: "n" });
  });
});

describe("contract: hasMcpOAuthTokens and isAccessTokenExpiring", () => {
  it("needs a non-empty access token", () => {
    assert.equal(hasMcpOAuthTokens(undefined), false);
    assert.equal(hasMcpOAuthTokens({}), false);
    assert.equal(
      hasMcpOAuthTokens({ tokens: { access_token: "", token_type: "Bearer" } }),
      false,
    );
    assert.equal(
      hasMcpOAuthTokens({
        tokens: { access_token: "a", token_type: "Bearer" },
      }),
      true,
    );
  });

  it("expires exactly two minutes before expires_in runs out", () => {
    const state: McpOAuthState = {
      tokens: {
        access_token: "a",
        token_type: "Bearer",
        expires_in: 3600,
        obtained_at: 1000,
      },
    };
    assert.equal(isAccessTokenExpiring(state, 1000 + 3_480_000 - 1), false);
    assert.equal(isAccessTokenExpiring(state, 1000 + 3_480_000), true);
    assert.equal(isAccessTokenExpiring(state, 1000 + 3_600_000), true);
  });

  it("treats a missing expires_in or obtained_at as live", () => {
    const base = { access_token: "a", token_type: "Bearer" };
    assert.equal(
      isAccessTokenExpiring({ tokens: { ...base, expires_in: 1 } }, 9e12),
      false,
    );
    assert.equal(
      isAccessTokenExpiring({ tokens: { ...base, obtained_at: 0 } }, 9e12),
      false,
    );
    assert.equal(isAccessTokenExpiring({}, 9e12), false);
  });
});

describe("contract: provider", () => {
  const redirectUrl = "http://127.0.0.1:4321/callback";

  it("registers with exact client metadata when interactive", () => {
    const provider = createMcpOAuthProvider({
      storage: memoryStorage(),
      redirectUrl,
      redirectToAuthorization: () => undefined,
    });
    assert.equal(provider.redirectUrl, redirectUrl);
    assert.deepEqual(provider.clientMetadata, {
      client_name: "vmem",
      redirect_uris: [redirectUrl],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid profile email",
    });
    assert.equal(typeof provider.saveClientInformation, "function");
  });

  it("uses a placeholder redirect and cannot register when refresh-only", () => {
    const provider = createMcpOAuthProvider({ storage: memoryStorage() });
    assert.equal(provider.redirectUrl, "http://127.0.0.1/callback");
    assert.deepEqual(provider.clientMetadata.redirect_uris, []);
    assert.equal(typeof provider.saveClientInformation, "undefined");
    // redirectUrl without a browser opener is not interactive either.
    const half = createMcpOAuthProvider({
      storage: memoryStorage(),
      redirectUrl,
    });
    assert.equal(typeof half.saveClientInformation, "undefined");
    assert.deepEqual(half.clientMetadata.redirect_uris, [redirectUrl]);
  });

  it("throws the exact sign-in message when it would open a browser", () => {
    const provider = createMcpOAuthProvider({ storage: memoryStorage() });
    assert.throws(
      () => provider.redirectToAuthorization(new URL("https://x.test")),
      (error: Error) =>
        error instanceof UnauthorizedError &&
        error.message === "Sign in from the vmem settings window",
    );
  });

  it("opens the browser with the authorization URL when interactive", async () => {
    const opened: string[] = [];
    const provider = createMcpOAuthProvider({
      storage: memoryStorage(),
      redirectUrl,
      redirectToAuthorization: (url) => {
        opened.push(url.toString());
      },
    });
    await provider.redirectToAuthorization(new URL("https://x.test/a?b=1"));
    assert.deepEqual(opened, ["https://x.test/a?b=1"]);
  });

  it("makes a fresh 16-byte base64url state each call and exposes the latest", async () => {
    const provider = createMcpOAuthProvider({ storage: memoryStorage() });
    assert.equal(provider.pendingState, undefined);
    const first = await provider.state?.();
    const second = await provider.state?.();
    assert.match(first ?? "", /^[A-Za-z0-9_-]{22}$/);
    assert.notEqual(first, second);
    assert.equal(provider.pendingState, second);
  });

  it("keeps the code verifier in memory only", async () => {
    const storage = memoryStorage();
    const provider = createMcpOAuthProvider({ storage });
    assert.throws(() => provider.codeVerifier(), {
      message: "No code verifier saved",
    });
    await provider.saveCodeVerifier("v");
    assert.equal(await provider.codeVerifier(), "v");
    assert.deepEqual(storage.saves, []);
    await provider.invalidateCredentials?.("verifier");
    assert.throws(() => provider.codeVerifier(), {
      message: "No code verifier saved",
    });
  });

  it("stores tokens exactly as given plus obtained_at, merged with the rest", async () => {
    const storage = memoryStorage({
      clientInformation: { client_id: "c" },
      identity: { email: "e" },
    });
    const provider = createMcpOAuthProvider({ storage, now: () => 1234 });
    await provider.saveTokens({
      access_token: "a",
      token_type: "Bearer",
      expires_in: 60,
      refresh_token: "r",
    });
    assert.deepEqual(storage.current, {
      clientInformation: { client_id: "c" },
      identity: { email: "e" },
      tokens: {
        access_token: "a",
        token_type: "Bearer",
        expires_in: 60,
        refresh_token: "r",
        obtained_at: 1234,
      },
    });
    assert.equal(
      JSON.stringify(storage.current),
      '{"clientInformation":{"client_id":"c"},"identity":{"email":"e"},"tokens":{"access_token":"a","token_type":"Bearer","expires_in":60,"refresh_token":"r","obtained_at":1234}}',
    );
    assert.deepEqual(await provider.tokens(), storage.current?.tokens);
  });

  it("stores registered client information with the redirect as fallback", async () => {
    const storage = memoryStorage();
    const provider = createMcpOAuthProvider({
      storage,
      redirectUrl,
      redirectToAuthorization: () => undefined,
    });
    await provider.saveClientInformation?.({
      client_id: "c1",
      client_id_issued_at: 7,
    });
    assert.deepEqual(storage.current, {
      clientInformation: {
        client_id: "c1",
        client_id_issued_at: 7,
        redirect_uris: [redirectUrl],
      },
    });
    await provider.saveClientInformation?.({
      client_id: "c2",
      redirect_uris: ["http://127.0.0.1:9/callback"],
    });
    assert.deepEqual(storage.current?.clientInformation, {
      client_id: "c2",
      redirect_uris: ["http://127.0.0.1:9/callback"],
    });
  });

  it("reuses client information only for the same redirect, or when none was stored", async () => {
    const forOther = memoryStorage({
      clientInformation: {
        client_id: "c",
        redirect_uris: ["http://127.0.0.1:1/callback"],
      },
    });
    const interactive = (storage: McpOAuthStorage) =>
      createMcpOAuthProvider({
        storage,
        redirectUrl,
        redirectToAuthorization: () => undefined,
      });
    assert.equal(await interactive(forOther).clientInformation(), undefined);
    const withoutUris = memoryStorage({
      clientInformation: { client_id: "c" },
    });
    assert.deepEqual(await interactive(withoutUris).clientInformation(), {
      client_id: "c",
    });
    assert.deepEqual(
      await createMcpOAuthProvider({ storage: forOther }).clientInformation(),
      { client_id: "c", redirect_uris: ["http://127.0.0.1:1/callback"] },
    );
  });

  it("clears each scope", async () => {
    const full = (): McpOAuthState => ({
      tokens: { access_token: "a", token_type: "Bearer" },
      clientInformation: { client_id: "c" },
      identity: { name: "n" },
    });
    const storage = memoryStorage(full());
    const provider = createMcpOAuthProvider({ storage });
    await provider.invalidateCredentials?.("client");
    assert.deepEqual(storage.current, {
      tokens: { access_token: "a", token_type: "Bearer" },
      clientInformation: undefined,
      identity: { name: "n" },
    });
    storage.current = full();
    await provider.invalidateCredentials?.("tokens");
    assert.deepEqual(storage.current, {
      tokens: undefined,
      clientInformation: { client_id: "c" },
      identity: { name: "n" },
    });
    await provider.invalidateCredentials?.("all");
    assert.equal(storage.current, undefined);
    assert.equal(storage.saves.at(-1), undefined);
  });
});

describe("contract: authorizeMcpServer", () => {
  it("returns without waiting for the code when already authorized", async () => {
    const storage = memoryStorage({
      tokens: { access_token: "a", token_type: "Bearer", refresh_token: "r" },
      clientInformation: { client_id: "c" },
    });
    const { fetch, calls } = fakeFetch({
      ...discoveryRoutes(),
      [`${AS}/token`]: () =>
        json(200, { access_token: "a2", token_type: "Bearer" }),
    });
    let rejectCode: (error: Error) => void = () => undefined;
    const code = new Promise<string>((_resolve, reject) => {
      rejectCode = reject;
    });
    await authorizeMcpServer({
      url: MCP,
      provider: createMcpOAuthProvider({
        storage,
        redirectUrl: "http://127.0.0.1:5/callback",
        redirectToAuthorization: () => undefined,
        now: () => 9,
      }),
      code,
      fetch,
    });
    // A late rejection of the code promise must not become unhandled.
    rejectCode(new Error("Sign-in timed out"));
    assert.deepEqual(storage.current?.tokens, {
      access_token: "a2",
      token_type: "Bearer",
      refresh_token: "r",
      obtained_at: 9,
    });
    assert.equal(calls.at(-1)?.url, `${AS}/token`);
  });

  it("passes the code rejection through", async () => {
    const { fetch } = fakeFetch({
      ...discoveryRoutes(),
      [`${AS}/register`]: echoRegistration,
    });
    await assert.rejects(
      authorizeMcpServer({
        url: MCP,
        provider: createMcpOAuthProvider({
          storage: memoryStorage(),
          redirectUrl: "http://127.0.0.1:5/callback",
          redirectToAuthorization: () => undefined,
        }),
        code: Promise.reject(new Error("Sign-in was cancelled")),
        fetch,
      }),
      { message: "Sign-in was cancelled" },
    );
  });

  it("sends the scope with the authorization request", async () => {
    const opened: URL[] = [];
    const { fetch, calls } = fakeFetch({
      ...discoveryRoutes(),
      [`${AS}/register`]: echoRegistration,
      [`${AS}/token`]: () =>
        json(200, { access_token: "a", token_type: "Bearer" }),
    });
    const storage = memoryStorage();
    await authorizeMcpServer({
      url: MCP,
      provider: createMcpOAuthProvider({
        storage,
        redirectUrl: "http://127.0.0.1:5/callback",
        redirectToAuthorization: (url) => {
          opened.push(url);
        },
        now: () => 3,
      }),
      code: Promise.resolve("the-code"),
      fetch,
    });
    assert.equal(opened[0]?.searchParams.get("scope"), "openid profile email");
    assert.equal(opened[0]?.searchParams.get("resource"), MCP);
    const register = calls.find((call) => call.url === `${AS}/register`);
    assert.deepEqual(
      jsonObjectSchema.parse(JSON.parse(register?.body ?? "{}")),
      {
        client_name: "vmem",
        redirect_uris: ["http://127.0.0.1:5/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "openid profile email",
      },
    );
    // SDK 1.29.0 stamps no issuer on the client or the tokens.
    assert.deepEqual(storage.current, {
      clientInformation: {
        client_name: "vmem",
        redirect_uris: ["http://127.0.0.1:5/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        scope: "openid profile email",
        client_id: "c",
      },
      tokens: { access_token: "a", token_type: "Bearer", obtained_at: 3 },
    });
    // The bytes that get encrypted to disk: client_id leads the client information.
    assert.equal(
      JSON.stringify(storage.current),
      '{"clientInformation":{"client_id":"c","redirect_uris":["http://127.0.0.1:5/callback"],"token_endpoint_auth_method":"none","grant_types":["authorization_code","refresh_token"],"response_types":["code"],"client_name":"vmem","scope":"openid profile email"},"tokens":{"access_token":"a","token_type":"Bearer","obtained_at":3}}',
    );
  });
});

describe("contract: refreshMcpOAuth", () => {
  const stored = (): McpOAuthState => ({
    tokens: { access_token: "a", token_type: "Bearer", refresh_token: "r" },
    clientInformation: { client_id: "c" },
  });

  it("refreshes with the stored refresh token and returns true", async () => {
    const storage = memoryStorage(stored());
    const { fetch, calls } = fakeFetch({
      ...discoveryRoutes(),
      [`${AS}/token`]: () =>
        json(200, { access_token: "a2", token_type: "Bearer", expires_in: 60 }),
    });
    const ok = await refreshMcpOAuth({
      url: MCP,
      provider: createMcpOAuthProvider({ storage, now: () => 50 }),
      fetch,
    });
    assert.equal(ok, true);
    const token = calls.find((call) => call.url === `${AS}/token`);
    assert.equal(token?.method, "POST");
    const body = new URLSearchParams(token?.body);
    assert.equal(body.get("grant_type"), "refresh_token");
    assert.equal(body.get("refresh_token"), "r");
    assert.equal(body.get("client_id"), "c");
    assert.equal(body.get("resource"), MCP);
    assert.equal(body.get("scope"), null);
    assert.deepEqual(storage.current, {
      tokens: {
        access_token: "a2",
        token_type: "Bearer",
        expires_in: 60,
        refresh_token: "r",
        obtained_at: 50,
      },
      clientInformation: { client_id: "c" },
    });
  });

  it("returns false, clears rejected tokens and never registers", async () => {
    const storage = memoryStorage(stored());
    const { fetch, calls } = fakeFetch({
      ...discoveryRoutes(),
      [`${AS}/token`]: () => json(400, { error: "invalid_grant" }),
    });
    const ok = await refreshMcpOAuth({
      url: MCP,
      provider: createMcpOAuthProvider({ storage }),
      fetch,
    });
    assert.equal(ok, false);
    assert.equal(storage.current?.tokens, undefined);
    assert.deepEqual(storage.current?.clientInformation, { client_id: "c" });
    assert.equal(
      calls.some((call) => call.url === `${AS}/register`),
      false,
    );
  });

  it("returns false when the server cannot be reached", async () => {
    const ok = await refreshMcpOAuth({
      url: MCP,
      provider: createMcpOAuthProvider({ storage: memoryStorage(stored()) }),
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });
    assert.equal(ok, false);
  });
});

describe("contract: revokeMcpOAuth", () => {
  const revokeRoute = {
    [`${AS}/revoke`]: () => new Response("", { status: 200 }),
  };

  it("does nothing without an access token", async () => {
    const { fetch, calls } = fakeFetch({});
    assert.equal(
      await revokeMcpOAuth({ url: MCP, state: undefined, fetch }),
      false,
    );
    assert.equal(
      await revokeMcpOAuth({
        url: MCP,
        state: { clientInformation: { client_id: "c" } },
        fetch,
      }),
      false,
    );
    assert.deepEqual(calls, []);
  });

  it("discovers from the MCP server without a stored issuer and revokes refresh then access token", async () => {
    const { fetch, calls } = fakeFetch({
      ...discoveryRoutes({ revocation_endpoint: `${AS}/revoke` }),
      ...revokeRoute,
    });
    const ok = await revokeMcpOAuth({
      url: MCP,
      state: {
        tokens: { access_token: "a", token_type: "Bearer", refresh_token: "r" },
        clientInformation: { client_id: "c", client_secret: "s" },
      },
      fetch,
    });
    assert.equal(ok, true);
    const revokes = calls.filter((call) => call.url === `${AS}/revoke`);
    assert.deepEqual(
      revokes.map(({ method, headers, body, hasSignal }) => ({
        method,
        headers,
        body,
        hasSignal,
      })),
      [
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "token=r&token_type_hint=refresh_token&client_id=c&client_secret=s",
          hasSignal: true,
        },
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: "token=a&token_type_hint=access_token&client_id=c&client_secret=s",
          hasSignal: true,
        },
      ],
    );
    assert.equal(
      calls[0]?.url,
      "https://mcp.test/.well-known/oauth-protected-resource/mcp",
    );
    assert.ok(calls.every((call) => call.hasSignal));
  });

  it("uses the stored issuer when there is one, tokens first", async () => {
    for (const state of [
      {
        tokens: { access_token: "a", token_type: "Bearer", issuer: AS },
        clientInformation: { client_id: "c", issuer: "https://other.test" },
      },
      {
        tokens: { access_token: "a", token_type: "Bearer" },
        clientInformation: { client_id: "c", issuer: AS },
      },
    ]) {
      const { fetch, calls } = fakeFetch({
        [`${AS}/.well-known/oauth-authorization-server`]: () =>
          json(200, asMetadata({ revocation_endpoint: `${AS}/revoke` })),
        ...revokeRoute,
      });
      assert.equal(await revokeMcpOAuth({ url: MCP, state, fetch }), true);
      assert.deepEqual(
        calls.map((call) => call.url),
        [`${AS}/.well-known/oauth-authorization-server`, `${AS}/revoke`],
      );
      assert.equal(
        calls[1]?.body,
        "token=a&token_type_hint=access_token&client_id=c",
      );
    }
  });

  it("sends no client fields without client information", async () => {
    const { fetch, calls } = fakeFetch({
      ...discoveryRoutes({ revocation_endpoint: `${AS}/revoke` }),
      ...revokeRoute,
    });
    await revokeMcpOAuth({
      url: MCP,
      state: { tokens: { access_token: "a", token_type: "Bearer" } },
      fetch,
    });
    assert.equal(calls.at(-1)?.body, "token=a&token_type_hint=access_token");
  });

  it("returns false without a revocation endpoint", async () => {
    const { fetch, calls } = fakeFetch(discoveryRoutes());
    assert.equal(
      await revokeMcpOAuth({
        url: MCP,
        state: { tokens: { access_token: "a", token_type: "Bearer" } },
        fetch,
      }),
      false,
    );
    assert.equal(
      calls.some((call) => call.method === "POST"),
      false,
    );
  });

  it("returns true when one revoke works and false when none do", async () => {
    const state: McpOAuthState = {
      tokens: { access_token: "a", token_type: "Bearer", refresh_token: "r" },
    };
    let status = 0;
    const routes = {
      ...discoveryRoutes({ revocation_endpoint: `${AS}/revoke` }),
      [`${AS}/revoke`]: () => {
        status = status === 0 ? 500 : 200;
        return new Response("", { status });
      },
    };
    assert.equal(
      await revokeMcpOAuth({ url: MCP, state, fetch: fakeFetch(routes).fetch }),
      true,
    );
    const failing = fakeFetch({
      ...discoveryRoutes({ revocation_endpoint: `${AS}/revoke` }),
      [`${AS}/revoke`]: () => new Response("", { status: 400 }),
    });
    assert.equal(
      await revokeMcpOAuth({ url: MCP, state, fetch: failing.fetch }),
      false,
    );
  });

  it("never throws on network or discovery errors", async () => {
    const state: McpOAuthState = {
      tokens: { access_token: "a", token_type: "Bearer" },
    };
    assert.equal(
      await revokeMcpOAuth({
        url: MCP,
        state,
        fetch: () => Promise.reject(new TypeError("fetch failed")),
      }),
      false,
    );
    const revokeThrows = fakeFetch({
      ...discoveryRoutes({ revocation_endpoint: `${AS}/revoke` }),
      [`${AS}/revoke`]: () => {
        throw new TypeError("fetch failed");
      },
    });
    assert.equal(
      await revokeMcpOAuth({ url: MCP, state, fetch: revokeThrows.fetch }),
      false,
    );
  });
});
