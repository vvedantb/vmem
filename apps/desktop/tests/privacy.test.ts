import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowClipboard,
  allowScreenshot,
  clipboardSnippet,
} from "../src/privacy";
import { defaultSettings } from "../src/settings-schema";

const code = { app: "Code", title: "a.ts" };

describe("privacy gates", () => {
  it("keeps clipboard and screenshots off by default", () => {
    assert.equal(allowClipboard(defaultSettings(), code), false);
    assert.equal(allowScreenshot(defaultSettings(), code), false);
  });

  it("allows captures only when enabled, unpaused and not blocked", () => {
    const on = {
      ...defaultSettings(),
      clipboardEnabled: true,
      screenshotsEnabled: true,
    };
    assert.equal(allowClipboard(on, code), true);
    assert.equal(allowScreenshot(on, code), true);
    assert.equal(allowClipboard({ ...on, paused: true }, code), false);
    assert.equal(allowScreenshot({ ...on, paused: true }, code), false);
    assert.equal(allowClipboard(on, { app: "Bitwarden", title: "" }), false);
    assert.equal(allowScreenshot(on, null), false);
    assert.equal(allowClipboard({ ...on, blocklist: ["code"] }, code), false);
  });

  it("redacts and trims clipboard text", () => {
    assert.equal(clipboardSnippet("   "), null);
    assert.ok(!clipboardSnippet("password=hunter2")?.includes("hunter2"));
    assert.ok((clipboardSnippet("x ".repeat(500))?.length ?? 0) <= 200);
  });
});
