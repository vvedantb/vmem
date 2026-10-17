import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { z } from "zod";
import { AuthService, identityFromIdToken } from "../src/auth";
import { OAuthStateStorage, type SecretCrypto } from "../src/auth-storage";
import type { McpOAuthState, McpOAuthStorage } from "../src/mcp-oauth";
import { SettingsStore } from "../src/settings";

const addressSchema = z.object({ port: z.number() });
const clientBodySchema = z.object({
  client_name: z.string(),
  redirect_uris: z.array(z.string()),
});

function jwt(claims: object): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part(claims)}.sig`;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += String(chunk)));
    req.on("end", () => resolve(body));
  });
}

/** A fake vmem host: protected resource metadata, an authorization server and a token endpoint. */
async function startFakeServer(options: { idToken: boolean }) {
  const seen: {
    registered: z.infer<typeof clientBodySchema>[];
    tokenBodies: URLSearchParams[];
    revoked: string[];
    userinfoAuth: (string | undefined)[];
  } = { registered: [], tokenBodies: [], revoked: [], userinfoAuth: [] };
  let base = "";
  let issued = 0;
  const server = createServer((req, res) => {
    void readBody(req).then((body) => {
      const send = (status: number, json: object) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(json));
      };
      const path = req.url?.split("?")[0] ?? "";
      if (path.startsWith("/.well-known/oauth-protected-resource")) {
        send(200, { resource: `${base}/mcp`, authorization_servers: [base] });
      } else if (path.startsWith("/.well-known/oauth-authorization-server")) {
        send(200, {
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          revocation_endpoint: `${base}/revoke`,
          userinfo_endpoint: `${base}/userinfo`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        });
      } else if (path === "/register") {
        const client = clientBodySchema.parse(JSON.parse(body));
        seen.registered.push(client);
        send(201, { ...client, client_id: "client-1" });
      } else if (path === "/token") {
        const params = new URLSearchParams(body);
        seen.tokenBodies.push(params);
        issued += 1;
        send(200, {
          access_token: `access-${String(issued)}`,
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: `refresh-${String(issued)}`,
          ...(options.idToken
            ? {
                id_token: jwt({
                  email: "ada@example.test",
                  name: "Ada Lovelace",
                }),
              }
            : {}),
        });
      } else if (path === "/revoke") {
        seen.revoked.push(new URLSearchParams(body).get("token") ?? "");
        send(200, {});
      } else if (path === "/userinfo") {
        seen.userinfoAuth.push(req.headers.authorization);
        send(200, {
          email: "grace@example.test",
          given_name: "Grace",
          family_name: "Hopper",
        });
      } else {
        send(404, {});
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${String(addressSchema.parse(server.address()).port)}`;
  return { base, seen, close: () => server.close() };
}

function memoryStorage(): McpOAuthStorage & {
  current: McpOAuthState | undefined;
} {
  const storage: McpOAuthStorage & { current: McpOAuthState | undefined } = {
    current: undefined,
    load: () => storage.current,
    save: (state) => {
      storage.current = state;
    },
  };
  return storage;
}

/** Stands in for the system browser: follows the authorization URL's redirect back to the loopback. */
async function fakeBrowser(url: string): Promise<void> {
  const authorize = new URL(url);
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorize.searchParams.get("response_type"), "code");
  const redirect = new URL(authorize.searchParams.get("redirect_uri") ?? "");
  assert.equal(redirect.hostname, "127.0.0.1");
  redirect.searchParams.set("code", "auth-code");
  redirect.searchParams.set("state", authorize.searchParams.get("state") ?? "");
  void fetch(redirect);
}

describe("AuthService", () => {
  it("signs in with code and PKCE, saves tokens and the id_token identity, then signs out with revocation", async () => {
    const fake = await startFakeServer({ idToken: true });
    try {
      const storage = memoryStorage();
      let apiKeyDropped = 0;
      const auth = new AuthService({
        storage,
        mcpUrl: `${fake.base}/mcp`,
        openExternal: fakeBrowser,
        dropLegacyApiKey: () => {
          apiKeyDropped += 1;
        },
      });
      assert.equal(auth.isSignedIn(), false);
      assert.equal(await auth.freshAccessToken(), null);

      await auth.signIn();

      assert.equal(auth.isSignedIn(), true);
      assert.equal(auth.currentAccessToken(), "access-1");
      assert.deepEqual(auth.identity(), {
        email: "ada@example.test",
        name: "Ada Lovelace",
      });
      assert.equal(apiKeyDropped, 1);
      assert.equal(fake.seen.registered[0]?.client_name, "vmem");
      assert.match(
        fake.seen.registered[0]?.redirect_uris[0] ?? "",
        /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
      );
      const exchange = fake.seen.tokenBodies[0];
      assert.equal(exchange?.get("grant_type"), "authorization_code");
      assert.equal(exchange?.get("code"), "auth-code");
      assert.ok(exchange?.get("code_verifier"));
      assert.equal(exchange?.get("resource"), `${fake.base}/mcp`);

      assert.equal(await auth.freshAccessToken(), "access-1");

      await auth.signOut();
      assert.deepEqual(fake.seen.revoked.sort(), ["access-1", "refresh-1"]);
      assert.equal(auth.isSignedIn(), false);
      assert.equal(storage.current, undefined);
      assert.equal(apiKeyDropped, 2);
    } finally {
      fake.close();
    }
  });

  it("falls back to the userinfo endpoint without an id_token", async () => {
    const fake = await startFakeServer({ idToken: false });
    try {
      const auth = new AuthService({
        storage: memoryStorage(),
        mcpUrl: `${fake.base}/mcp`,
        openExternal: fakeBrowser,
        dropLegacyApiKey: () => undefined,
      });
      await auth.signIn();
      assert.deepEqual(auth.identity(), {
        email: "grace@example.test",
        name: "Grace Hopper",
      });
      assert.deepEqual(fake.seen.userinfoAuth, ["Bearer access-1"]);
    } finally {
      fake.close();
    }
  });

  it("refreshes an expiring access token before it is used", async () => {
    const fake = await startFakeServer({ idToken: true });
    try {
      let now = 1_000_000;
      const auth = new AuthService({
        storage: memoryStorage(),
        mcpUrl: `${fake.base}/mcp`,
        openExternal: fakeBrowser,
        dropLegacyApiKey: () => undefined,
        now: () => now,
      });
      await auth.signIn();
      now += 3600_000;
      assert.equal(await auth.freshAccessToken(), "access-2");
      const refresh = fake.seen.tokenBodies[1];
      assert.equal(refresh?.get("grant_type"), "refresh_token");
      assert.equal(refresh?.get("refresh_token"), "refresh-1");
    } finally {
      fake.close();
    }
  });

  it("fails sign-in when the browser sends back a wrong state", async () => {
    const fake = await startFakeServer({ idToken: true });
    try {
      const storage = memoryStorage();
      const auth = new AuthService({
        storage,
        mcpUrl: `${fake.base}/mcp`,
        openExternal: async (url) => {
          const redirect = new URL(
            new URL(url).searchParams.get("redirect_uri") ?? "",
          );
          redirect.searchParams.set("code", "x");
          redirect.searchParams.set("state", "forged");
          const response = await fetch(redirect);
          assert.equal(response.status, 400);
          // The user gives up: the real redirect has `error`.
          const cancel = new URL(redirect);
          cancel.searchParams.delete("code");
          cancel.searchParams.set("error", "access_denied");
          cancel.searchParams.set(
            "state",
            new URL(url).searchParams.get("state") ?? "",
          );
          void fetch(cancel);
        },
        dropLegacyApiKey: () => undefined,
      });
      await assert.rejects(auth.signIn(), /cancelled/);
      assert.equal(auth.isSignedIn(), false);
    } finally {
      fake.close();
    }
  });
});

describe("identityFromIdToken", () => {
  it("reads email and name and ignores bad tokens", () => {
    assert.deepEqual(
      identityFromIdToken(
        jwt({ email: "a@b.test", given_name: "A", family_name: "B" }),
      ),
      { email: "a@b.test", name: "A B" },
    );
    assert.equal(identityFromIdToken("not-a-jwt"), undefined);
  });
});

describe("OAuthStateStorage", () => {
  const fakeCrypto = (available: boolean): SecretCrypto => ({
    available: () => available,
    encrypt: (plain) => Buffer.from(`enc:${plain}`).toString("base64"),
    decrypt: (cipher) =>
      Buffer.from(cipher, "base64").toString().replace(/^enc:/, ""),
  });
  const state: McpOAuthState = {
    tokens: { access_token: "secret-access", token_type: "Bearer" },
    clientInformation: { client_id: "c" },
  };
  const tempDir = () => mkdtempSync(join(tmpdir(), "vmem-auth-"));

  it("keeps only ciphertext on disk and restores it after a restart", () => {
    const dir = tempDir();
    const settings = new SettingsStore(dir);
    new OAuthStateStorage(settings, fakeCrypto(true)).save(state);
    assert.notEqual(settings.get().oauthCipher, "");
    assert.equal(settings.get().oauthCipher.includes("secret-access"), false);
    const restored = new OAuthStateStorage(
      new SettingsStore(dir),
      fakeCrypto(true),
    );
    assert.equal(restored.load()?.tokens?.access_token, "secret-access");
    restored.save(undefined);
    assert.equal(new SettingsStore(dir).get().oauthCipher, "");
  });

  it("keeps tokens in memory only when encryption is unavailable", () => {
    const dir = tempDir();
    const settings = new SettingsStore(dir);
    const storage = new OAuthStateStorage(settings, fakeCrypto(false));
    storage.save(state);
    assert.equal(storage.load()?.tokens?.access_token, "secret-access");
    assert.equal(settings.get().oauthCipher, "");
    const next = new OAuthStateStorage(
      new SettingsStore(dir),
      fakeCrypto(false),
    );
    assert.equal(next.load(), undefined);
  });
});
