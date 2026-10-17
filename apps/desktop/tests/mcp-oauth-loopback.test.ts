import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startLoopback } from "../src/mcp-oauth-loopback";

describe("loopback", () => {
  it("listens on 127.0.0.1 and resolves the code when the state matches", async () => {
    const loopback = await startLoopback();
    try {
      assert.match(
        loopback.redirectUrl,
        /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
      );
      const code = loopback.waitForCode(() => "s1");
      const response = await fetch(`${loopback.redirectUrl}?code=abc&state=s1`);
      assert.equal(response.status, 200);
      const page = await response.text();
      assert.match(page, /vmem/);
      assert.doesNotMatch(page, /Bee/);
      assert.equal(await code, "abc");
    } finally {
      loopback.close();
    }
  });

  it("rejects a mismatched state and keeps waiting", async () => {
    const loopback = await startLoopback();
    try {
      const code = loopback.waitForCode(() => "right");
      const bad = await fetch(`${loopback.redirectUrl}?code=evil&state=wrong`);
      assert.equal(bad.status, 400);
      const none = await fetch(`${loopback.redirectUrl}?code=evil`);
      assert.equal(none.status, 400);
      await fetch(`${loopback.redirectUrl}?code=good&state=right`);
      assert.equal(await code, "good");
    } finally {
      loopback.close();
    }
  });

  it("answers 404 for other paths", async () => {
    const loopback = await startLoopback();
    try {
      const url = new URL(loopback.redirectUrl);
      const response = await fetch(`${url.origin}/other`);
      assert.equal(response.status, 404);
    } finally {
      loopback.close();
    }
  });

  it("rejects when the provider reports an error", async () => {
    const loopback = await startLoopback();
    try {
      const code = loopback.waitForCode(() => "s");
      const outcome = assert.rejects(code, /cancelled/);
      await fetch(`${loopback.redirectUrl}?error=access_denied&state=s`);
      await outcome;
    } finally {
      loopback.close();
    }
  });

  it("rejects when no redirect arrives in time", async () => {
    const loopback = await startLoopback();
    try {
      await assert.rejects(
        loopback.waitForCode(() => "s", 20),
        /timed out/,
      );
    } finally {
      loopback.close();
    }
  });
});
