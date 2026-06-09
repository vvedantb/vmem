import { importBookmarks, syncSingleBookmark } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { refreshUserSettingsMirrorFromConvex } from "./user-settings-mirror";
import { hasActiveClerkSession, warmBackgroundAuth } from "./auth";
import { getStorage, setStorage } from "@/lib/storage";

export const HISTORY_ALARM_NAME = "vmem-history-sync";
const HISTORY_SYNC_INTERVAL_MINUTES = 30;

export const SETTINGS_MIRROR_ALARM_NAME = "vmem-user-settings-mirror";
const SETTINGS_MIRROR_INTERVAL_MINUTES = 5;
const CATCHUP_MIN_INTERVAL_MS = 5 * 60 * 1000;

export const BADGE_TICK_ALARM_NAME = "vmem-sync-badge-tick";
const BADGE_TICK_INTERVAL_MINUTES = 1;
/** Matches the popup's --accent token (near-black, monochrome brand). */
const BADGE_BACKGROUND_COLOR = "#363636";

let alarmListenerRegistered = false;
let lastCatchUpAttemptMs = 0;
let bookmarkListenerRegistered = false;
let historySyncInProgress = false;

/**
 * Register alarm listener at service worker top level.
 * Must be called synchronously when SW starts so it's ready
 * when an alarm wakes the worker. Idempotent.
 */
export function registerAlarmListener(): void {
  if (alarmListenerRegistered) return;
  alarmListenerRegistered = true;

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HISTORY_ALARM_NAME) {
      void handleHistoryAlarm();
      return;
    }
    if (alarm.name === SETTINGS_MIRROR_ALARM_NAME) {
      void handleHeartbeat();
      return;
    }
    if (alarm.name === BADGE_TICK_ALARM_NAME) {
      void handleBadgeTick();
      return;
    }
  });
}

/**
 * Heartbeat — runs every SETTINGS_MIRROR_INTERVAL_MINUTES (5 min), the most
 * reliable periodic wake the worker has. Beyond refreshing settings it acts as
 * a watchdog: MV3 can silently drop the slower 30-min history alarm (OS
 * sleep/hibernate on Windows, SW crash, extension update), and without a
 * frequent re-assertion a dropped alarm stays dead until the next browser
 * restart — the exact cause of multi-day silent sync gaps. Here we re-assert
 * the history alarm and immediately catch up if a sync is overdue, so recovery
 * happens within 5 minutes instead of waiting for onStartup.
 */
async function handleHeartbeat(): Promise<void> {
  void refreshUserSettingsMirrorFromConvex();

  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) return;

  // Resurrect the history alarm if Chrome dropped it (idempotent — only
  // creates when absent, so an existing alarm's timer is never reset).
  await startAutoSync();
  await catchUpHistorySyncIfOverdue();
}

/**
 * Register bookmark listener at service worker top level. The handler
 * checks `autoSyncEnabled` at call time so the listener can stay wired
 * even when sync is disabled. Must be called synchronously on every SW
 * wake — without this, Chrome's aggressive SW eviction (~30s idle) means
 * bookmarks created while the SW was dormant get silently dropped.
 * Idempotent.
 */
export function registerBookmarkListener(): void {
  if (bookmarkListenerRegistered) return;
  bookmarkListenerRegistered = true;

  chrome.bookmarks.onCreated.addListener((id, bookmark) => {
    void handleBookmarkCreated(id, bookmark);
  });
}

export async function handleBookmarkCreated(
  id: string,
  bookmark: chrome.bookmarks.BookmarkTreeNode,
): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  const hasSession = await hasActiveClerkSession();
  if (!autoSyncEnabled) return;
  if (!hasSession) return;
  await syncSingleBookmark(id, bookmark);
}

export async function ensureSettingsMirrorAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(SETTINGS_MIRROR_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(SETTINGS_MIRROR_ALARM_NAME, {
    periodInMinutes: SETTINGS_MIRROR_INTERVAL_MINUTES,
  });
}

async function ensureBadgeTickAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(BADGE_TICK_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(BADGE_TICK_ALARM_NAME, {
    periodInMinutes: BADGE_TICK_INTERVAL_MINUTES,
  });
}

/**
 * Badge tick — fires every minute while auto-sync is enabled. Keeps the
 * action-icon badge counting down to the next history sync, and doubles as
 * a third watchdog leg: each tick re-asserts the history alarm (idempotent),
 * so a dropped alarm now heals within ~1 minute instead of ~5. When auto-sync
 * is disabled the tick retires itself so the worker stops waking every minute.
 */
async function handleBadgeTick(): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) {
    await chrome.alarms.clear(BADGE_TICK_ALARM_NAME);
    await updateSyncBadge();
    return;
  }
  await startAutoSync(); // idempotent — heals a dropped history alarm + updates badge
}

/**
 * Show minutes until the next scheduled history sync on the extension icon.
 * Reads the real alarm's scheduledTime so the countdown reflects what Chrome
 * will actually fire, not a parallel estimate. Cleared when auto-sync is off.
 */
export async function updateSyncBadge(): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  const alarm = autoSyncEnabled
    ? await chrome.alarms.get(HISTORY_ALARM_NAME)
    : undefined;
  if (!alarm || typeof alarm.scheduledTime !== "number") {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  const minutes = Math.max(
    1,
    Math.ceil((alarm.scheduledTime - Date.now()) / 60_000),
  );
  await chrome.action.setBadgeBackgroundColor({
    color: BADGE_BACKGROUND_COLOR,
  });
  await chrome.action.setBadgeText({ text: `${minutes}m` });
}

/**
 * Ensure periodic alarms exist whenever the service worker starts.
 * MV3 workers are ephemeral — onInstalled/onStartup alone miss wakes from
 * alarms, messages, and dev reloads, leaving auto-sync scheduled but with
 * no active alarm if it was ever lost.
 */
export async function bootstrapSyncSchedulers(): Promise<void> {
  await ensureSettingsMirrorAlarm();
  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) {
    await updateSyncBadge(); // clears any stale countdown left on the icon
    return;
  }

  await startAutoSync();
  void warmBackgroundAuth();
  void catchUpHistorySyncIfOverdue();
}

/**
 * Ensure the history-sync alarm is scheduled. `chrome.alarms.create` with
 * an existing name CANCELS and REPLACES the alarm, resetting its timer.
 * If the user restarts Chrome more often than the sync interval (e.g.
 * laptop reboot, profile reload), repeatedly calling create would mean
 * the alarm never reaches its fire time — so we only create when absent.
 *
 * Idempotent.
 */
export async function startAutoSync(): Promise<void> {
  await ensureBadgeTickAlarm();
  const existing = await chrome.alarms.get(HISTORY_ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(HISTORY_ALARM_NAME, {
      periodInMinutes: HISTORY_SYNC_INTERVAL_MINUTES,
    });
  }
  await updateSyncBadge();
}

/** Clear the periodic history alarm (and the badge countdown driven by it).
 * Bookmark listener stays wired — its handler checks the autoSyncEnabled
 * flag at call time. */
export async function stopAutoSync(): Promise<void> {
  await chrome.alarms.clear(HISTORY_ALARM_NAME);
  await chrome.alarms.clear(BADGE_TICK_ALARM_NAME);
  await updateSyncBadge();
}

/**
 * If the last history sync is older than the sync interval (or never
 * happened), fire one immediately. Called after SW startup so users
 * don't wait up to 30 minutes for a sync after a browser restart.
 */
export async function catchUpHistorySyncIfOverdue(): Promise<void> {
  const { autoSyncEnabled, lastHistorySync } = await getStorage();
  if (!autoSyncEnabled) return;

  const intervalMs = HISTORY_SYNC_INTERVAL_MINUTES * 60 * 1000;
  const overdue =
    lastHistorySync === 0 || Date.now() - lastHistorySync > intervalMs;
  if (!overdue) return;

  const now = Date.now();
  if (now - lastCatchUpAttemptMs < CATCHUP_MIN_INTERVAL_MS) return;
  lastCatchUpAttemptMs = now;

  await handleHistoryAlarm();
}

/** Manual/debug entry — same path as the 30-min alarm. */
export async function runAutoSyncNow(): Promise<void> {
  await handleHistoryAlarm();
}

/**
 * Record why the latest sync attempt did or didn't run, so a silent gap is
 * always diagnosable from storage (popup / debug report) rather than looking
 * healthy. `reason === ""` means the attempt synced successfully.
 */
async function recordSyncAttempt(reason: string): Promise<void> {
  await setStorage({
    lastSyncAttemptAt: Date.now(),
    lastSyncSkipReason: reason,
  });
}

/** Called by alarm — checks auth + auto-sync setting before syncing. */
async function handleHistoryAlarm(): Promise<void> {
  if (historySyncInProgress) {
    await recordSyncAttempt("in-progress");
    return;
  }

  historySyncInProgress = true;

  try {
    console.info("[vmem] History sync alarm fired");
    // Mutual watchdog: ensure the frequent heartbeat alarm still exists. As
    // long as either alarm survives, each fire resurrects the other — so a
    // single dropped alarm can never permanently stop auto-sync.
    await ensureSettingsMirrorAlarm();

    const { autoSyncEnabled } = await getStorage();
    if (!autoSyncEnabled) {
      await recordSyncAttempt("disabled");
      return;
    }

    await warmBackgroundAuth();
    const hasSession = await hasActiveClerkSession();
    if (!hasSession) {
      await recordSyncAttempt("no-session");
      console.warn(
        "[vmem] History sync skipped — no active Clerk session " +
          "(sign in on the vmem site so the extension can read your syncHost session).",
      );
      return;
    }

    const result = await importHistory(undefined, true);
    const bookmarkResult = await importBookmarks(true);
    await recordSyncAttempt("");
    console.info(
      `[vmem] History sync finished — imported ${result.imported} new entries; bookmarks ${bookmarkResult.imported} new`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordSyncAttempt(`error: ${message}`);
    console.error("[vmem] History sync failed:", message);
  } finally {
    historySyncInProgress = false;
    // Reset the countdown — after a fire, the alarm's scheduledTime is the
    // next full interval away.
    void updateSyncBadge();
  }
}

/**
 * Drive an alarm handler by name and await it. Mirrors the live
 * `onAlarm` dispatch but returns the promise so callers/tests can await the
 * full sync + watchdog cycle. No-op for unknown names.
 */
export async function dispatchAlarm(alarmName: string): Promise<void> {
  if (alarmName === HISTORY_ALARM_NAME) {
    await handleHistoryAlarm();
    return;
  }
  if (alarmName === SETTINGS_MIRROR_ALARM_NAME) {
    await handleHeartbeat();
    return;
  }
  if (alarmName === BADGE_TICK_ALARM_NAME) {
    await handleBadgeTick();
  }
}
