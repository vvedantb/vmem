import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ActiveWindow } from "../src/blocklist";
import type { ActivityEvent } from "../src/events";
import { defaultSettings, type Settings } from "../src/settings-schema";
import { Tracker } from "../src/tracker";

function setup(overrides: Partial<Settings> = {}) {
  const events: ActivityEvent[] = [];
  const errors: string[] = [];
  const state: {
    now: number;
    idle: number;
    window: ActiveWindow | null;
    throws: boolean;
    settings: Settings;
  } = {
    now: 1_000_000,
    idle: 0,
    window: { app: "Code", title: "a.ts" },
    throws: false,
    settings: { ...defaultSettings(), ...overrides },
  };
  const tracker = new Tracker({
    getActiveWindow: async () => {
      if (state.throws) throw new Error("native failure");
      return state.window;
    },
    getIdleSeconds: () => state.idle,
    getSettings: () => state.settings,
    record: (event) => events.push(event),
    logError: (message) => errors.push(message),
    now: () => state.now,
  });
  return { tracker, events, errors, state };
}

describe("Tracker", () => {
  it("records focus only when the window changes", async () => {
    const { tracker, events, state } = setup();
    await tracker.tick();
    await tracker.tick();
    state.window = { app: "Code", title: "b.ts" };
    await tracker.tick();
    assert.deepEqual(
      events.map((e) => e.kind === "focus" && e.title),
      ["a.ts", "b.ts"],
    );
  });

  it("records nothing but one gap while paused", async () => {
    const { tracker, events, state } = setup({ paused: true });
    await tracker.tick();
    await tracker.tick();
    assert.deepEqual(events, [
      { kind: "gap", at: state.now, reason: "paused" },
    ]);
    assert.equal(tracker.activeWindow(), null);
  });

  it("backdates idle to the last input and resumes with focus", async () => {
    const { tracker, events, state } = setup();
    await tracker.tick();
    state.now += 20 * 60_000;
    state.idle = 6 * 60;
    await tracker.tick();
    assert.deepEqual(events[1], {
      kind: "gap",
      at: state.now - 6 * 60_000,
      reason: "idle",
    });
    state.idle = 0;
    await tracker.tick();
    assert.equal(events[2]?.kind, "focus");
  });

  it("honours the idle threshold setting", async () => {
    const { tracker, events, state } = setup({ idleThresholdMinutes: 1 });
    state.idle = 90;
    await tracker.tick();
    assert.equal(events[0]?.kind === "gap" && events[0].reason, "idle");
  });

  it("records a gap, not the window, for blocked apps", async () => {
    const { tracker, events, state } = setup();
    state.window = { app: "1Password", title: "Vault" };
    await tracker.tick();
    assert.deepEqual(events, [
      { kind: "gap", at: state.now, reason: "blocked" },
    ]);
    assert.ok(!JSON.stringify(events).includes("Vault"));
  });

  it("survives native window API failures", async () => {
    const { tracker, events, state } = setup();
    state.throws = true;
    await tracker.tick();
    assert.equal(events[0]?.kind === "gap" && events[0].reason, "unknown");
  });

  it("logs native failures at most once per 30 s", async () => {
    const { tracker, errors, state } = setup();
    state.throws = true;
    await tracker.tick();
    state.now += 29_000;
    await tracker.tick();
    assert.deepEqual(errors, ["active window failed: native failure"]);
    state.now += 1_000;
    await tracker.tick();
    assert.equal(errors.length, 2);
  });

  it("splits the session when the native call fails after a focus", async () => {
    const { tracker, events, state } = setup();
    await tracker.tick();
    state.throws = true;
    await tracker.tick();
    assert.deepEqual(
      events.map((e) => e.kind),
      ["focus", "gap"],
    );
  });

  it("sanitises secret-looking titles", async () => {
    const { tracker, events, state } = setup();
    state.window = { app: "Code", title: "env password=hunter2" };
    await tracker.tick();
    assert.ok(!JSON.stringify(events).includes("hunter2"));
  });
});
