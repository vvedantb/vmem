import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canRecord, recordingSettings } from "../src/can-record";
import { defaultSettings } from "../src/settings-schema";

describe("canRecord", () => {
  it("records only when signed in and not paused", () => {
    const settings = defaultSettings();
    assert.equal(canRecord(settings, true), true);
    assert.equal(canRecord(settings, false), false);
    assert.equal(canRecord({ ...settings, paused: true }, true), false);
  });

  it("treats signed out as paused even when Pause is off", () => {
    const settings = defaultSettings();
    assert.equal(settings.paused, false);
    assert.equal(recordingSettings(settings, false).paused, true);
    assert.equal(recordingSettings(settings, true).paused, false);
  });
});
