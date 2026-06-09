/**
 * Behavioral verification of the MV3 auto-sync watchdog.
 *
 * Drives the REAL exported functions in src/background/sync-scheduler.ts against
 * a faithful in-memory mock of chrome.alarms + chrome.storage (no network — the
 * unauthenticated auth path short-circuits before any fetch). Each test maps to
 * one requirement from the goal: auto-sync must stay active, survive a browser
 * restart, and survive Chrome silently dropping either periodic alarm — never
 * going silent without recording why.
 *
 * Run: npx tsx --test tests/sync-watchdog.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

// ── In-memory Chrome mock ────────────────────────────────────────────────────

interface AlarmOpts {
  periodInMinutes?: number;
}

const alarms = new Map<string, AlarmOpts>();
const createCalls: string[] = []; // every create, to prove idempotency / no timer reset
let local: Record<string, unknown> = {};
let session: Record<string, unknown> = {};

function resetState(initialLocal: Record<string, unknown> = {}): void {
  alarms.clear();
  createCalls.length = 0;
  local = { ...initialLocal };
  session = {}; // empty session => no auth token => no Clerk session (hermetic)
}

// @ts-expect-error — minimal chrome surface used by the scheduler under test
globalThis.chrome = {
  alarms: {
    async get(name: string): Promise<AlarmOpts | undefined> {
      return alarms.get(name);
    },
    async create(name: string, opts: AlarmOpts): Promise<void> {
      createCalls.push(name);
      alarms.set(name, opts);
    },
    async clear(name: string): Promise<boolean> {
      return alarms.delete(name);
    },
    onAlarm: { addListener(): void {} },
  },
  storage: {
    local: {
      async get(defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
        return { ...defaults, ...local };
      },
      async set(obj: Record<string, unknown>): Promise<void> {
        Object.assign(local, obj);
      },
    },
    session: {
      async get(defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
        return { ...defaults, ...session };
      },
      async set(obj: Record<string, unknown>): Promise<void> {
        Object.assign(session, obj);
      },
    },
  },
  bookmarks: { onCreated: { addListener(): void {} } },
  // Force the offscreen auth refresh to yield no token => hasActiveClerkSession() === false.
  offscreen: {
    Reason: { WORKERS: "WORKERS" },
    async createDocument(): Promise<void> {
      throw new Error("no offscreen in test");
    },
  },
  runtime: {
    ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
    getURL(p: string): string {
      return p;
    },
    async getContexts(): Promise<unknown[]> {
      return [];
    },
    async sendMessage(): Promise<{ token: string | null }> {
      return { token: null };
    },
  },
};

// Import AFTER the mock is installed (static import of the real module).
const {
  HISTORY_ALARM_NAME,
  SETTINGS_MIRROR_ALARM_NAME,
  bootstrapSyncSchedulers,
  startAutoSync,
  stopAutoSync,
  ensureSettingsMirrorAlarm,
  catchUpHistorySyncIfOverdue,
  dispatchAlarm,
} = await import("../src/background/sync-scheduler.ts");

const NOW = Date.now();
const FRESH = NOW - 60_000; // 1 min ago: NOT overdue (interval is 30 min)

// ── Tests ────────────────────────────────────────────────────────────────────

test("startAutoSync is idempotent — never resets an existing alarm's timer", async () => {
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

test("browser restart: bootstrap re-asserts BOTH alarms from a clean slate", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  // Simulate worst case: all alarms gone after restart/crash.
  assert.equal(alarms.size, 0);
  await bootstrapSyncSchedulers();
  assert.ok(alarms.has(HISTORY_ALARM_NAME), "history alarm restored");
  assert.ok(alarms.has(SETTINGS_MIRROR_ALARM_NAME), "heartbeat alarm restored");
});

test("Chrome drops the history alarm → heartbeat heals it within one tick", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  // Chrome silently evicts the slow alarm.
  alarms.delete(HISTORY_ALARM_NAME);
  assert.ok(!alarms.has(HISTORY_ALARM_NAME), "history alarm dropped");
  // The 5-min heartbeat fires.
  await dispatchAlarm(SETTINGS_MIRROR_ALARM_NAME);
  assert.ok(alarms.has(HISTORY_ALARM_NAME), "heartbeat recreated the history alarm");
});

test("Chrome drops the heartbeat alarm → a history-alarm fire heals it (mutual watchdog)", async () => {
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

test("no silent gaps: every attempt records lastSyncAttemptAt + skip reason", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  await dispatchAlarm(HISTORY_ALARM_NAME); // no session in test
  assert.ok(
    typeof local.lastSyncAttemptAt === "number" && local.lastSyncAttemptAt >= NOW,
    "lastSyncAttemptAt advanced",
  );
  assert.equal(
    local.lastSyncSkipReason,
    "no-session",
    "skip reason recorded so the gap is diagnosable, not invisible",
  );
});

test("overdue sync keeps retrying (does not advance lastHistorySync while blocked)", async () => {
  // lastHistorySync = 0 => never synced => overdue => catch-up fires on heartbeat.
  resetState({ autoSyncEnabled: true, lastHistorySync: 0 });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  await dispatchAlarm(SETTINGS_MIRROR_ALARM_NAME); // heartbeat → catch-up → blocked on no session
  assert.equal(
    local.lastHistorySync,
    0,
    "lastHistorySync stays overdue so recovery keeps retrying once auth returns",
  );
  assert.equal(local.lastSyncSkipReason, "no-session", "attempt was recorded");
});

test("auto-sync disabled: history alarm not created, heartbeat still present", async () => {
  resetState({ autoSyncEnabled: false, lastHistorySync: FRESH });
  await bootstrapSyncSchedulers();
  assert.ok(
    !alarms.has(HISTORY_ALARM_NAME),
    "no history alarm while disabled",
  );
  assert.ok(
    alarms.has(SETTINGS_MIRROR_ALARM_NAME),
    "heartbeat alarm always present (drives settings mirror + watchdog)",
  );
  // Heartbeat while disabled must not resurrect the history alarm.
  await dispatchAlarm(SETTINGS_MIRROR_ALARM_NAME);
  assert.ok(
    !alarms.has(HISTORY_ALARM_NAME),
    "disabled heartbeat does not create the history alarm",
  );
});

test("stopAutoSync clears only the history alarm, leaving the heartbeat", async () => {
  resetState({ autoSyncEnabled: true, lastHistorySync: FRESH });
  await ensureSettingsMirrorAlarm();
  await startAutoSync();
  await stopAutoSync();
  assert.ok(!alarms.has(HISTORY_ALARM_NAME), "history alarm cleared");
  assert.ok(alarms.has(SETTINGS_MIRROR_ALARM_NAME), "heartbeat survives");
});
