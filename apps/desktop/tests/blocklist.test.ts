import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBlocked, redactSecrets, sanitiseTitle } from "../src/blocklist";

describe("isBlocked", () => {
  it("blocks every default password manager by app name", () => {
    const apps = [
      "1Password",
      "Bitwarden",
      "LastPass",
      "KeePassXC",
      "Dashlane",
      "NordPass",
      "Proton Pass",
      "RoboForm",
    ];
    for (const app of apps) {
      assert.equal(isBlocked({ app, title: "Vault" }), true, app);
    }
  });

  it("blocks a password manager shown in a browser title", () => {
    assert.equal(
      isBlocked({ app: "Google Chrome", title: "Bitwarden Web Vault" }),
      true,
    );
  });

  it("blocks private browsing titles case-insensitively", () => {
    for (const title of [
      "New Tab - Google Chrome (Incognito)",
      "InPrivate - Microsoft Edge",
      "Mozilla Firefox Private Browsing",
      "Safari - private window",
    ]) {
      assert.equal(isBlocked({ app: "Browser", title }), true, title);
    }
  });

  it("allows ordinary windows", () => {
    assert.equal(
      isBlocked({
        app: "Code",
        title: "search.ts - vmem - Visual Studio Code",
      }),
      false,
    );
  });

  it("applies user patterns and ignores blank ones", () => {
    const win = { app: "Slack", title: "general" };
    assert.equal(isBlocked(win, ["slack"]), true);
    assert.equal(isBlocked(win, ["", "  "]), false);
  });
});

describe("sanitiseTitle", () => {
  it("redacts secret-looking fragments", () => {
    const out = sanitiseTitle(
      "login password=hunter2 key abcdef0123456789abcdef0123456789abcd",
    );
    assert.ok(!out.includes("hunter2"));
    assert.ok(!out.includes("abcdef0123456789"));
    assert.ok(out.includes("[redacted]"));
  });

  it("truncates long titles", () => {
    assert.ok(sanitiseTitle("a ".repeat(200)).length <= 120);
  });

  it("keeps normal text and collapses whitespace", () => {
    assert.equal(redactSecrets("  hello   world "), "hello world");
  });
});
