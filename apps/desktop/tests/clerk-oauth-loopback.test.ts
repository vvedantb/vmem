import assert from "node:assert/strict";
import { createServer } from "node:net";
import { describe, it } from "node:test";
import {
  CLERK_OAUTH_PATH,
  CLERK_OAUTH_PORT,
  CLERK_OAUTH_REDIRECT_URL,
  CLERK_OAUTH_TIMEOUT_MS,
  createClerkOAuthLoopback,
} from "../src/clerk-oauth-loopback";
import { SIGN_IN_PAGE_CSP } from "../src/clerk-oauth-page";
import { freePort, refused, send, waitFor } from "./helpers/loopback-http";

const PROVIDER =
  "https://accounts.example.com/o/oauth2/auth?client_id=vmem&state=s1";

/** A loopback on a free port whose browser is a spy that records each URL it was asked to open. */
async function setup(
  options: {
    openExternal?: (url: string) => Promise<void>;
    timeoutMs?: number;
    logo?: string;
  } = {},
) {
  const port = await freePort();
  const opened: string[] = [];
  const loopback = createClerkOAuthLoopback({
    port,
    timeoutMs: options.timeoutMs,
    logo: options.logo,
    openExternal: async (url) => {
      opened.push(url);
      await options.openExternal?.(url);
    },
  });
  const firstOpen = () =>
    waitFor(() => {
      const url = opened[0];
      if (url === undefined) throw new Error("The browser was not opened yet");
      return url;
    });
  return {
    port,
    loopback,
    opened,
    firstOpen,
    redirectUrl: loopback.redirectUrl,
  };
}

const stopped = (url: string) =>
  waitFor(async () => assert.equal(await refused(url), true));

describe("sign-in loopback", () => {
  it("uses http://127.0.0.1:45790/sso-callback (not Bee's 45789) and waits three minutes", () => {
    assert.equal(
      CLERK_OAUTH_REDIRECT_URL,
      "http://127.0.0.1:45790/sso-callback",
    );
    assert.deepEqual(
      [CLERK_OAUTH_PORT, CLERK_OAUTH_PATH, CLERK_OAUTH_TIMEOUT_MS],
      [45790, "/sso-callback", 180_000],
    );
    assert.equal(
      createClerkOAuthLoopback({ openExternal: async () => undefined })
        .redirectUrl,
      CLERK_OAUTH_REDIRECT_URL,
    );
  });

  it("listens only while a sign-in waits and resolves with the full callback URL", async () => {
    const { loopback, opened, firstOpen, redirectUrl } = await setup();
    assert.match(redirectUrl, /^http:\/\/127\.0\.0\.1:\d+\/sso-callback$/);
    assert.equal(await refused(redirectUrl), true);

    const result = loopback.open(PROVIDER);
    assert.equal(await firstOpen(), PROVIDER);
    const page = await send(`${redirectUrl}?rotating_token_nonce=abc`);

    assert.equal(page.status, 200);
    assert.equal(page.headers["content-type"], "text/html; charset=utf-8");
    assert.equal(page.headers["cache-control"], "no-store");
    assert.equal(page.headers["content-security-policy"], SIGN_IN_PAGE_CSP);
    assert.equal(page.headers["referrer-policy"], "no-referrer");
    assert.match(page.body, /<h1>Signed in to vmem<\/h1>/);
    assert.match(page.body, /href="vmem:\/\/renderer\/"/);
    assert.deepEqual(await result, {
      callbackUrl: `${redirectUrl}?rotating_token_nonce=abc`,
    });
    assert.equal(opened.length, 1);
    await stopped(redirectUrl);
  });

  it("puts the app icon on the page when given one", async () => {
    const logo = "data:image/png;base64,AAAA";
    const { loopback, firstOpen, redirectUrl } = await setup({ logo });
    const result = loopback.open(PROVIDER);
    await firstOpen();
    const page = await send(redirectUrl);
    assert.match(page.body, /<img src="data:image\/png;base64,AAAA"/);
    await result;
  });

  for (const [name, query, heading] of [
    [
      "cancelled",
      "?__clerk_status=failed&__clerk_error_code=oauth_access_denied",
      "Sign-in was cancelled",
    ],
    [
      "failed",
      "?__clerk_status=failed&__clerk_error_code=oauth_callback_failed",
      "Sign-in did not finish",
    ],
    [
      "a plain OAuth error",
      "?error=server_error&error_description=x",
      "Sign-in did not finish",
    ],
  ]) {
    it(`shows a friendly page and still hands over the URL when sign-in is ${name}`, async () => {
      const { loopback, firstOpen, redirectUrl } = await setup();
      const result = loopback.open(PROVIDER);
      await firstOpen();
      const page = await send(redirectUrl + query);
      assert.equal(page.status, 200);
      assert.ok(page.body.includes(`<h1>${heading}</h1>`));
      assert.ok(page.body.includes(">Return to vmem</a>"));
      assert.deepEqual(await result, { callbackUrl: redirectUrl + query });
    });
  }

  it("answers other paths and methods with 404 and keeps waiting", async () => {
    const { loopback, firstOpen, port, redirectUrl } = await setup();
    const result = loopback.open(PROVIDER);
    await firstOpen();
    for (const path of [
      "/",
      "/favicon.ico",
      "/sso-callback/",
      "/sso-callback/extra",
      "/callback",
    ]) {
      const reply = await send(
        `http://127.0.0.1:${String(port)}${path}?rotating_token_nonce=abc`,
      );
      assert.deepEqual(
        [path, reply.status, reply.body],
        [path, 404, "Not found"],
      );
    }
    assert.equal(
      (await send(`${redirectUrl}?rotating_token_nonce=abc`, "POST")).status,
      404,
    );
    await assert.rejects(loopback.open(PROVIDER), /already in progress/);

    await send(`${redirectUrl}?rotating_token_nonce=ok`);
    assert.deepEqual(await result, {
      callbackUrl: `${redirectUrl}?rotating_token_nonce=ok`,
    });
  });

  it("runs one sign-in at a time and starts clean for the next one", async () => {
    const { loopback, opened, redirectUrl } = await setup();
    for (const nonce of ["first", "second"]) {
      opened.length = 0;
      const result = loopback.open(PROVIDER);
      await assert.rejects(loopback.open(PROVIDER), {
        message: "Sign-in is already in progress in your browser.",
      });
      await waitFor(() => assert.equal(opened.length, 1));
      await send(`${redirectUrl}?rotating_token_nonce=${nonce}`);
      assert.deepEqual(await result, {
        callbackUrl: `${redirectUrl}?rotating_token_nonce=${nonce}`,
      });
      await stopped(redirectUrl);
    }
  });

  it("opens only https provider pages", async () => {
    const { loopback, opened, redirectUrl } = await setup();
    for (const url of [
      "http://accounts.example.com/",
      "javascript:alert(1)",
      "vmem://renderer/",
      "file:///etc/passwd",
      "not a url",
      "",
      42,
      undefined,
    ]) {
      await assert.rejects(loopback.open(url), {
        message: "Sign-in can only open an https link.",
      });
    }
    assert.equal(opened.length, 0);
    assert.equal(await refused(redirectUrl), true);
  });

  it("times out, stops listening and lets the next sign-in start", async () => {
    const { loopback, opened, redirectUrl } = await setup({ timeoutMs: 50 });
    await assert.rejects(loopback.open(PROVIDER), {
      message: "Sign-in timed out. Try again.",
    });
    await stopped(redirectUrl);

    opened.length = 0;
    const next = loopback.open(PROVIDER);
    await waitFor(() => assert.equal(opened.length, 1));
    await send(`${redirectUrl}?rotating_token_nonce=abc`);
    assert.deepEqual(await next, {
      callbackUrl: `${redirectUrl}?rotating_token_nonce=abc`,
    });
  });

  it("rejects and stops listening when the browser cannot be opened", async () => {
    const { loopback, redirectUrl } = await setup({
      openExternal: () => Promise.reject(new Error("no browser")),
    });
    await assert.rejects(loopback.open(PROVIDER), { message: "no browser" });
    await stopped(redirectUrl);
    await assert.rejects(loopback.open(PROVIDER), { message: "no browser" });
  });

  it("says so when the port is taken, without opening the browser", async () => {
    const { loopback, opened, port } = await setup();
    const squatter = createServer();
    await new Promise<void>((resolve) =>
      squatter.listen(port, "127.0.0.1", resolve),
    );
    try {
      await assert.rejects(loopback.open(PROVIDER), {
        message: `vmem could not start sign-in: port ${String(port)} is in use.`,
      });
      assert.equal(opened.length, 0);
    } finally {
      await new Promise<void>((resolve) => squatter.close(() => resolve()));
    }
    // Nothing is left pending: the next sign-in opens the browser.
    const next = loopback.open(PROVIDER);
    await waitFor(() => assert.equal(opened.length, 1));
    loopback.cancel();
    await assert.rejects(next, { message: "Sign-in was cancelled." });
  });

  it("cancel ends a waiting sign-in and stops listening; with nothing waiting it does nothing", async () => {
    const { loopback, firstOpen, redirectUrl } = await setup();
    loopback.cancel();
    const result = loopback.open(PROVIDER);
    await firstOpen();
    loopback.cancel();
    await assert.rejects(result, { message: "Sign-in was cancelled." });
    await stopped(redirectUrl);
  });

  it("does not stay listening when cancelled before the port opened", async () => {
    const { loopback, opened, redirectUrl } = await setup();
    const result = loopback.open(PROVIDER);
    loopback.cancel();
    await assert.rejects(result, { message: "Sign-in was cancelled." });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(await refused(redirectUrl), true);
    assert.equal(opened.length, 0);
  });
});
