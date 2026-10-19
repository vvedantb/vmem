import assert from "node:assert/strict";
import { request } from "node:http";
import { describe, it } from "node:test";
import {
  LOOPBACK_PATH,
  LOOPBACK_TIMEOUT_MS,
  startLoopback,
  type Loopback,
} from "../src/mcp-oauth-loopback";

// Pins the exact responses of the sign-in redirect server: status codes, headers and HTML.

const page = (text: string): string =>
  `<!doctype html><meta charset="utf-8"><title>vmem</title><body style="font:16px system-ui;margin:3rem"><p>${text}</p></body>`;
const INVALID = page(
  "This sign-in link is not valid. Go back to vmem and try again.",
);
const SUCCESS = page("You can close this window and go back to vmem.");
const NOT_COMPLETED = page(
  "Sign-in was not completed. You can close this window.",
);
const HTML = "text/html; charset=utf-8";

type Reply = { status: number; contentType: string | null; body: string };

async function get(url: string, method = "GET"): Promise<Reply> {
  const response = await fetch(url, { method });
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    body: await response.text(),
  };
}

async function withLoopback(run: (loopback: Loopback) => Promise<void>) {
  const loopback = await startLoopback();
  try {
    await run(loopback);
  } finally {
    loopback.close();
  }
}

describe("contract: loopback", () => {
  it("keeps the path and timeout", () => {
    assert.equal(LOOPBACK_PATH, "/callback");
    assert.equal(LOOPBACK_TIMEOUT_MS, 300_000);
  });

  it("answers the matching redirect with 200 and the success page", () =>
    withLoopback(async (loopback) => {
      assert.match(
        loopback.redirectUrl,
        /^http:\/\/127\.0\.0\.1:[1-9]\d*\/callback$/,
      );
      const code = loopback.waitForCode(() => "s1");
      assert.deepEqual(await get(`${loopback.redirectUrl}?code=abc&state=s1`), {
        status: 200,
        contentType: HTML,
        body: SUCCESS,
      });
      assert.equal(await code, "abc");
    }));

  it("answers 400 with the invalid page for a wrong, missing or unset state", () =>
    withLoopback(async (loopback) => {
      const invalid = { status: 400, contentType: HTML, body: INVALID };
      // Before waitForCode no state is expected.
      assert.deepEqual(
        await get(`${loopback.redirectUrl}?code=x&state=s`),
        invalid,
      );
      const code = loopback.waitForCode(() => "right");
      assert.deepEqual(
        await get(`${loopback.redirectUrl}?code=x&state=wrong`),
        invalid,
      );
      assert.deepEqual(await get(`${loopback.redirectUrl}?code=x`), invalid);
      assert.deepEqual(
        await get(`${loopback.redirectUrl}?error=access_denied`),
        invalid,
      );
      await get(`${loopback.redirectUrl}?code=good&state=right`);
      assert.equal(await code, "good");
    }));

  it("answers 400 when the expected state is empty", () =>
    withLoopback(async (loopback) => {
      void loopback.waitForCode(() => "", 50).catch(() => undefined);
      assert.equal(
        (await get(`${loopback.redirectUrl}?code=x&state=`)).status,
        400,
      );
    }));

  it("reads the expected state when the request arrives", () =>
    withLoopback(async (loopback) => {
      const expected: { state?: string } = {};
      const code = loopback.waitForCode(() => expected.state);
      expected.state = "late";
      await get(`${loopback.redirectUrl}?code=c&state=late`);
      assert.equal(await code, "c");
    }));

  it("answers 200 with the not-completed page and rejects on an error", () =>
    withLoopback(async (loopback) => {
      const code = loopback.waitForCode(() => "s");
      const outcome = assert.rejects(code, {
        message: "Sign-in was cancelled",
      });
      assert.deepEqual(
        await get(`${loopback.redirectUrl}?error=access_denied&code=c&state=s`),
        { status: 200, contentType: HTML, body: NOT_COMPLETED },
      );
      await outcome;
    }));

  it("rejects with the no-code message when neither code nor error is sent", () =>
    withLoopback(async (loopback) => {
      const code = loopback.waitForCode(() => "s");
      const outcome = assert.rejects(code, {
        message: "Sign-in returned no code",
      });
      assert.deepEqual(await get(`${loopback.redirectUrl}?state=s`), {
        status: 200,
        contentType: HTML,
        body: NOT_COMPLETED,
      });
      await outcome;
    }));

  it("answers 404 with an empty body for other paths and methods", () =>
    withLoopback(async (loopback) => {
      const url = new URL(loopback.redirectUrl);
      const notFound = { status: 404, contentType: null, body: "" };
      assert.deepEqual(await get(`${url.origin}/other`), notFound);
      assert.deepEqual(await get(`${url.origin}/callback/x`), notFound);
      assert.deepEqual(
        await get(`${loopback.redirectUrl}?code=c&state=s`, "POST"),
        notFound,
      );
    }));

  it("sends only the expected headers on the success page", () =>
    withLoopback(async (loopback) => {
      void loopback.waitForCode(() => "s");
      const url = new URL(`${loopback.redirectUrl}?code=c&state=s`);
      const headers = await new Promise<string[]>((resolve, reject) => {
        const req = request(url, (res) => {
          res.resume();
          resolve(
            Object.keys(res.headers)
              .filter((name) => name !== "date")
              .sort(),
          );
        });
        req.on("error", reject);
        req.end();
      });
      assert.deepEqual(headers, [
        "connection",
        "content-type",
        "keep-alive",
        "transfer-encoding",
      ]);
    }));

  it("rejects with the timeout message", () =>
    withLoopback(async (loopback) => {
      await assert.rejects(
        loopback.waitForCode(() => "s", 20),
        {
          message: "Sign-in timed out",
        },
      );
    }));
});
