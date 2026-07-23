// AI-generated (Claude), prompt: "add tests for the mv3 autosync watchdog against a chrome mock"
// Modified by me: kept existing header notes and covered one requirement per test
// verifies the mv3 autosync watchdog
//
// drives the real scheduler exports against a chrome mock
// no network runs because auth stops before fetch
// each test covers one watchdog requirement
//
// run with pnpm test
import test from "node:test";
import assert from "node:assert/strict";

// chrome mock

interface AlarmOpts {
  periodInMinutes?: number;
  scheduledTime?: number;
}

const alarms = new Map<string, AlarmOpts>();
const createCalls: string[] = []; // every create call
const badgeTexts: string[] = []; // every badge text
let local: Record<string, unknown> = {};
let session: Record<string, unknown> = {};

function makeStorageArea(getArea: () => Record<string, unknown>) {
  return {
    async get(
      keys: string | string[] | Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
      const area = getArea();
      if (typeof keys === "string") {
        return { [keys]: area[keys] };
      }
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        for (const key of keys) {
          if (key in area) result[key] = area[key];
        }
        return result;
      }
      return { ...keys, ...area };
    },
    async set(obj: Record<string, unknown>): Promise<void> {
      Object.assign(getArea(), obj);
    },
    async remove(keys: string | string[]): Promise<void> {
      const area = getArea();
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete area[key];
      }
    },
  };
}

function resetState(initialLocal: Record<string, unknown> = {}): void {
  alarms.clear();
  createCalls.length = 0;
  badgeTexts.length = 0;
  local = { ...initialLocal };
  session = {}; // no auth token
}

Object.defineProperty(globalThis, "chrome", {
  value: {
  alarms: {
    async get(name: string): Promise<AlarmOpts | undefined> {
      return alarms.get(name);
    },
    async create(name: string, opts: AlarmOpts): Promise<void> {
      createCalls.push(name);
      alarms.set(name, {
        ...opts,
        scheduledTime: Date.now() + (opts.periodInMinutes ?? 0) * 60_000,
      });
    },
    async clear(name: string): Promise<boolean> {
      return alarms.delete(name);
    },
    onAlarm: { addListener(): void {} },
  },
  storage: {
    local: makeStorageArea(() => local),
    session: makeStorageArea(() => session),
  },
  bookmarks: { onCreated: { addListener(): void {} } },
  action: {
    async setBadgeText({ text }: { text: string }): Promise<void> {
      badgeTexts.push(text);
    },
    async setBadgeBackgroundColor(): Promise<void> {},
  },
  // no cookies api means no session or network
  runtime: {
    id: "test-extension",
    getURL(p: string): string {
      return p;
    },
  },
  },
});

// import after the mock is installed
const {
  HISTORY_ALARM_NAME,
  SETTINGS_MIRROR_ALARM_NAME,
  BADGE_TICK_ALARM_NAME,
  bootstrapSyncSchedulers,
  startAutoSync,
  stopAutoSync,
  rescheduleHistorySync,
  ensureSettingsMirrorAlarm,
  dispatchAlarm,
} = await import("../src/background/sync-scheduler.ts");

const NOW = Date.now();
const FRESH = NOW - 60_000; // not overdue

// tests

await test("startAutoSync is idempotent — never resets an existing alarm's timer", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await startAutoSync();
  await startAutoSync();
  await startAutoSync();
  assert.ok(alarms.has(HISTORY_ALARM_NAME), "history alarm exists");
  assert.equal(
    createCalls.filter((n) => n === HISTORY_ALARM_NAME).length,
    1,
    "create called exactly once across repeated calls (no timer reset)",
  );
});

await test("browser restart: bootstrap re-asserts BOTH alarms from a clean slate", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  // all alarms gone after restart
  assert.equal(alarms.size, 0);
  await bootstrapSyncSchedulers();
  assert.ok(alarms.has(HISTORY_ALARM_NAME), "history alarm restored");
  assert.ok(alarms.has(SETTINGS_MIRROR_ALARM_NAME), "heartbeat alarm restored");
});

await test("Chrome drops the history alarm → heartbeat heals it within one tick", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  // chrome evicts the slow alarm
  alarms.delete(HISTORY_ALARM_NAME);
  assert.ok(!alarms.has(HISTORY_ALARM_NAME), "history alarm dropped");
  // heartbeat fires
  await dispatchAlarm(SETTINGS_MIRROR_ALARM_NAME);
  assert.ok(
    alarms.has(HISTORY_ALARM_NAME),
    "heartbeat recreated the history alarm",
  );
});

await test("Chrome drops the heartbeat alarm → a history-alarm fire heals it (mutual watchdog)", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  alarms.delete(SETTINGS_MIRROR_ALARM_NAME);
  assert.ok(!alarms.has(SETTINGS_MIRROR_ALARM_NAME), "heartbeat alarm dropped");
  await dispatchAlarm(HISTORY_ALARM_NAME);
  assert.ok(
    alarms.has(SETTINGS_MIRROR_ALARM_NAME),
    "history-alarm fire recreated the heartbeat alarm",
  );
});

await test("no silent gaps: every attempt records lastSyncAttemptAt + skip reason", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  await dispatchAlarm(HISTORY_ALARM_NAME); // no test session
  assert.ok(
    typeof local.lastSyncAttemptAt === "number" &&
      local.lastSyncAttemptAt >= NOW,
    "lastSyncAttemptAt advanced",
  );
  assert.equal(
    local.lastSyncSkipReason,
    "no-session",
    "skip reason recorded so the gap is diagnosable, not invisible",
  );
});

await test("overdue sync keeps retrying (does not advance lastHistorySync while blocked)", async () => {
  // never synced means overdue
  resetState({ autoSyncEnabled: true, lastHistorySync: 0 });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  await dispatchAlarm(SETTINGS_MIRROR_ALARM_NAME); // blocked on no session
  assert.equal(
    local.lastHistorySync,
    0,
    "lastHistorySync stays overdue so recovery keeps retrying once auth returns",
  );
  assert.equal(local.lastSyncSkipReason, "no-session", "attempt was recorded");
});

await test("auto-sync disabled: history alarm not created, heartbeat still present", async () => {
  resetState({ autoSyncEnabled: false, lastHistorySync: FRESH });
  await bootstrapSyncSchedulers();
  assert.ok(!alarms.has(HISTORY_ALARM_NAME), "no history alarm while disabled");
  assert.ok(
    alarms.has(SETTINGS_MIRROR_ALARM_NAME),
    "heartbeat alarm always present (drives settings mirror + watchdog)",
  );
  // heartbeat must not recreate history while disabled
  await dispatchAlarm(SETTINGS_MIRROR_ALARM_NAME);
  assert.ok(
    !alarms.has(HISTORY_ALARM_NAME),
    "disabled heartbeat does not create the history alarm",
  );
});

await test("stopAutoSync clears the history + badge alarms, leaving the heartbeat", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  await stopAutoSync();
  assert.ok(!alarms.has(HISTORY_ALARM_NAME), "history alarm cleared");
  assert.ok(!alarms.has(BADGE_TICK_ALARM_NAME), "badge tick cleared");
  assert.ok(alarms.has(SETTINGS_MIRROR_ALARM_NAME), "heartbeat survives");
  assert.equal(badgeTexts.at(-1), "", "badge cleared on stop");
});

await test("badge shows minutes until the next history sync", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await startAutoSync();
  assert.ok(alarms.has(BADGE_TICK_ALARM_NAME), "badge tick alarm created");
  assert.equal(
    badgeTexts.at(-1),
    "30m",
    "badge shows full interval after scheduling",
  );
});

await test("badge tick heals a dropped history alarm within one minute", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await startAutoSync();
  alarms.delete(HISTORY_ALARM_NAME);
  await dispatchAlarm(BADGE_TICK_ALARM_NAME);
  assert.ok(
    alarms.has(HISTORY_ALARM_NAME),
    "badge tick recreated the history alarm",
  );
  assert.equal(badgeTexts.at(-1), "30m", "badge reflects the recreated alarm");
});

await test("badge tick retires itself and clears the badge when auto-sync is disabled", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await startAutoSync();
  local.autoSyncEnabled = false;
  await dispatchAlarm(BADGE_TICK_ALARM_NAME);
  assert.ok(!alarms.has(BADGE_TICK_ALARM_NAME), "badge tick alarm removed");
  assert.equal(badgeTexts.at(-1), "", "badge cleared while disabled");
});

// configurable sync frequency

await test("startAutoSync honors a non-default interval and stays idempotent", async () => {
  resetState({
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 120,
    lastHistorySync: FRESH,
  });
  await startAutoSync();
  await startAutoSync();
  assert.equal(
    alarms.get(HISTORY_ALARM_NAME)?.periodInMinutes,
    120,
    "alarm uses the configured 2h period",
  );
  assert.equal(
    createCalls.filter((n) => n === HISTORY_ALARM_NAME).length,
    1,
    "unchanged interval never recreates the alarm (no timer reset)",
  );
});

await test("changing the interval reschedules the history alarm to the new period", async () => {
  resetState({
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 30,
    lastHistorySync: FRESH,
  });
  await startAutoSync();
  assert.equal(alarms.get(HISTORY_ALARM_NAME)?.periodInMinutes, 30);
  // user changes the interval
  local.autoSyncIntervalMinutes = 360;
  await rescheduleHistorySync();
  assert.equal(
    alarms.get(HISTORY_ALARM_NAME)?.periodInMinutes,
    360,
    "alarm rescheduled to the new 6h period",
  );
  assert.equal(
    createCalls.filter((n) => n === HISTORY_ALARM_NAME).length,
    2,
    "recreated exactly once for the changed period",
  );
});

await test("an out-of-range stored interval is clamped, not passed through", async () => {
  resetState({
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 5, // below floor
    lastHistorySync: FRESH,
  });
  await startAutoSync();
  assert.equal(
    alarms.get(HISTORY_ALARM_NAME)?.periodInMinutes,
    15,
    "sub-minimum interval clamps up to 15 min",
  );
});

await test("rescheduleHistorySync is a no-op while auto-sync is disabled", async () => {
  resetState({
    autoSyncEnabled: false,
    autoSyncIntervalMinutes: 60,
    lastHistorySync: FRESH,
  });
  await rescheduleHistorySync();
  assert.ok(
    !alarms.has(HISTORY_ALARM_NAME),
    "disabled extension never gets a live history alarm",
  );
});

await test("badge shows whole hours once the countdown passes an hour", async () => {
  resetState({
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 360,
    lastHistorySync: FRESH,
  });
  await startAutoSync();
  assert.equal(
    badgeTexts.at(-1),
    "6h",
    "a 6h interval renders as hours, not 360m",
  );
});
