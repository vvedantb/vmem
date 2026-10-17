import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SettingsStore } from "../src/settings";
import {
  defaultSettings,
  formSettingsPatchSchema,
  settingsSchema,
} from "../src/settings-schema";

describe("settings schema", () => {
  it("parses an old settings.json with apiKey and baseUrl", () => {
    const parsed = settingsSchema.parse({
      apiKey: "vmem_sk_old",
      baseUrl: "https://example.test",
      paused: true,
      idleThresholdMinutes: 10,
    });
    assert.equal(parsed.apiKey, "vmem_sk_old");
    assert.equal(parsed.paused, true);
    assert.equal(parsed.idleThresholdMinutes, 10);
    assert.equal("baseUrl" in parsed, false);
    assert.equal(parsed.oauthCipher, "");
  });

  it("does not let the window send credentials", () => {
    assert.throws(() => formSettingsPatchSchema.parse({ apiKey: "x" }));
    assert.throws(() => formSettingsPatchSchema.parse({ oauthCipher: "x" }));
    assert.deepEqual(formSettingsPatchSchema.parse({ paused: true }), {
      paused: true,
    });
  });
});

describe("SettingsStore", () => {
  function tempDir(): string {
    return mkdtempSync(join(tmpdir(), "vmem-settings-"));
  }

  it("loads an old file, drops baseUrl on save and keeps the key", () => {
    const dir = tempDir();
    const file = join(dir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        apiKey: "vmem_sk_old",
        baseUrl: "https://example.test",
      }),
    );
    const store = new SettingsStore(dir);
    assert.equal(store.get().apiKey, "vmem_sk_old");
    store.update({ paused: true });
    const saved = readFileSync(file, "utf8");
    assert.equal(saved.includes("baseUrl"), false);
    assert.equal(statSync(file).mode & 0o777, 0o600);
  });

  it("drops the saved key after sign-in", () => {
    const dir = tempDir();
    const store = new SettingsStore(dir);
    store.update({ apiKey: "vmem_sk_old" });
    store.update({ apiKey: "" });
    assert.equal(store.get().apiKey, "");
    assert.equal(new SettingsStore(dir).get().apiKey, "");
    assert.deepEqual(defaultSettings().apiKey, "");
  });
});
