import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  CLERK_OAUTH_CHANNELS,
  fromRenderer,
  registerClerkOAuthIpc,
  type InvokeEvent,
  type InvokeHandlers,
} from "../src/clerk-oauth-ipc";
import { freePort, refused, send, waitFor } from "./helpers/loopback-http";

type Listener = (event: InvokeEvent, arg: unknown) => unknown;

const PROVIDER = "https://accounts.example.com/o/oauth2/auth?state=s1";
const TOKEN_CACHE_GET = "clerk:token-cache:get";

/** Like Electron's ipcMain: a second handler for one channel throws. */
function fakeIpcMain() {
  const handlers = new Map<string, Listener>();
  const ipcMain: InvokeHandlers = {
    handle(channel, listener) {
      if (handlers.has(channel)) {
        throw new Error(
          `Attempted to register a second handler for '${channel}'`,
        );
      }
      handlers.set(channel, listener);
    },
    removeHandler(channel) {
      handlers.delete(channel);
    },
  };
  const invoke = (channel: string, from: InvokeEvent, arg?: unknown) => {
    const handler = handlers.get(channel);
    if (handler === undefined) throw new Error(`No handler for ${channel}`);
    return Promise.resolve().then(() => handler(from, arg));
  };
  return { ipcMain, handlers, invoke };
}

/** An invoke event from a frame on `url`; by default the main frame of the settings window. */
function event(
  url = "vmem://renderer/",
  options: { type?: string; mainFrame?: boolean } = {},
): InvokeEvent {
  const frame = { url };
  return {
    sender: {
      getType: () => options.type ?? "window",
      mainFrame: options.mainFrame === false ? { url } : frame,
    },
    senderFrame: frame,
  };
}

function setup(options: { port?: number } = {}) {
  const ipc = fakeIpcMain();
  const opened: string[] = [];
  let fronted = 0;
  // What createClerkBridge registers before vmem replaces the OAuth pair.
  for (const channel of [
    TOKEN_CACHE_GET,
    ...Object.values(CLERK_OAUTH_CHANNELS),
  ]) {
    ipc.ipcMain.handle(channel, () => `clerk ${channel}`);
  }
  const tokenCache = ipc.handlers.get(TOKEN_CACHE_GET);
  const cleanup = registerClerkOAuthIpc({
    ipcMain: ipc.ipcMain,
    port: options.port,
    openExternal: async (url) => {
      opened.push(url);
    },
    bringToFront: () => {
      fronted += 1;
    },
  });
  return { ...ipc, opened, fronted: () => fronted, cleanup, tokenCache };
}

describe("registerClerkOAuthIpc", () => {
  it("uses the channel names that @clerk/electron's preload invokes", () => {
    // The package does not export them, so read its built channel table (dist/cjs/ipc-<hash>.js).
    const dist = dirname(
      createRequire(import.meta.url).resolve("@clerk/electron"),
    );
    const chunk = readdirSync(dist).find((file) => /^ipc-.*\.js$/.test(file));
    const source = readFileSync(join(dist, chunk ?? "missing"), "utf8");
    assert.ok(
      source.includes(
        `getRedirectUrl: "${CLERK_OAUTH_CHANNELS.getRedirectUrl}"`,
      ),
    );
    assert.ok(source.includes(`open: "${CLERK_OAUTH_CHANNELS.open}"`));
    assert.ok(source.includes(`getToken: "${TOKEN_CACHE_GET}"`));
  });

  it("replaces the bridge's OAuth handlers and leaves the token cache alone", async () => {
    const { handlers, invoke, tokenCache } = setup();
    assert.equal(handlers.get(TOKEN_CACHE_GET), tokenCache);
    assert.equal(
      await invoke(CLERK_OAUTH_CHANNELS.getRedirectUrl, event()),
      "http://127.0.0.1:45790/sso-callback",
    );
  });

  it("answers only the main frame of a window on vmem://renderer/", async () => {
    const { invoke, opened } = setup();
    const strangers = [
      event("vmem://renderer/", { mainFrame: false }),
      event("vmem://renderer/", { type: "webview" }),
      event("https://renderer/"),
      event("bee://renderer/"),
      event("vmem://other/"),
      event("not a url"),
    ];
    for (const from of strangers) {
      assert.equal(fromRenderer(from), false);
      await assert.rejects(invoke(CLERK_OAUTH_CHANNELS.getRedirectUrl, from), {
        message: "Not allowed",
      });
      await assert.rejects(invoke(CLERK_OAUTH_CHANNELS.open, from, PROVIDER), {
        message: "Not allowed",
      });
    }
    assert.equal(opened.length, 0);
    assert.equal(fromRenderer(event("vmem://renderer/#/factor-one")), true);
  });

  it("opens the provider page, returns the callback URL and brings the window to the front", async () => {
    const port = await freePort();
    const { invoke, opened, fronted } = setup({ port });
    const result = invoke(CLERK_OAUTH_CHANNELS.open, event(), PROVIDER);
    await waitFor(() => assert.deepEqual(opened, [PROVIDER]));
    assert.equal(fronted(), 0);

    const page = await send(
      `http://127.0.0.1:${String(port)}/sso-callback?rotating_token_nonce=abc`,
    );
    assert.ok(page.body.includes("<h1>Signed in to vmem</h1>"));
    assert.deepEqual(await result, {
      callbackUrl: `http://127.0.0.1:${String(port)}/sso-callback?rotating_token_nonce=abc`,
    });
    assert.equal(fronted(), 1);
  });

  it("refuses non-https pages without opening the browser", async () => {
    const { invoke, opened, fronted } = setup({ port: await freePort() });
    for (const url of [
      "http://accounts.example.com/",
      "vmem://renderer/",
      "file:///etc/passwd",
      7,
    ]) {
      await assert.rejects(invoke(CLERK_OAUTH_CHANNELS.open, event(), url), {
        message: "Sign-in can only open an https link.",
      });
    }
    assert.equal(opened.length, 0);
    assert.equal(fronted(), 0);
  });

  it("cleanup ends a waiting sign-in, stops listening and removes its handlers", async () => {
    const port = await freePort();
    const { invoke, opened, cleanup, handlers } = setup({ port });
    const result = invoke(CLERK_OAUTH_CHANNELS.open, event(), PROVIDER);
    await waitFor(() => assert.equal(opened.length, 1));
    cleanup();
    await assert.rejects(result, { message: "Sign-in was cancelled." });
    assert.deepEqual([...handlers.keys()], [TOKEN_CACHE_GET]);
    await waitFor(async () =>
      assert.equal(
        await refused(`http://127.0.0.1:${String(port)}/sso-callback`),
        true,
      ),
    );
  });
});
