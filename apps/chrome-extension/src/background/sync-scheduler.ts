import { syncSingleBookmark } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { refreshUserSettingsMirrorFromConvex } from "./user-settings-mirror";
import { hasActiveClerkSession } from "./auth";
import { getStorage } from "@/lib/storage";

const HISTORY_ALARM_NAME = "vmem-history-sync";
const HISTORY_SYNC_INTERVAL_MINUTES = 30;

const SETTINGS_MIRROR_ALARM_NAME = "vmem-user-settings-mirror";
const SETTINGS_MIRROR_INTERVAL_MINUTES = 5;

let alarmListenerRegistered = false;
let bookmarkListenerRegistered = false;

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
      void refreshUserSettingsMirrorFromConvex();
      return;
    }
  });
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

async function handleBookmarkCreated(
  id: string,
  bookmark: chrome.bookmarks.BookmarkTreeNode,
): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) return;
  if (!(await hasActiveClerkSession())) return;
  await syncSingleBookmark(id, bookmark);
}

export function ensureSettingsMirrorAlarm(): void {
  void chrome.alarms.create(SETTINGS_MIRROR_ALARM_NAME, {
    periodInMinutes: SETTINGS_MIRROR_INTERVAL_MINUTES,
  });
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
  const existing = await chrome.alarms.get(HISTORY_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(HISTORY_ALARM_NAME, {
    periodInMinutes: HISTORY_SYNC_INTERVAL_MINUTES,
  });
}

/** Clear the periodic history alarm. Bookmark listener stays wired —
 * its handler checks the autoSyncEnabled flag at call time. */
export async function stopAutoSync(): Promise<void> {
  await chrome.alarms.clear(HISTORY_ALARM_NAME);
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

  await handleHistoryAlarm();
}

/** Called by alarm — checks auth + auto-sync setting before syncing. */
async function handleHistoryAlarm(): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) return;
  if (!(await hasActiveClerkSession())) {
    console.warn(
      "[vmem] History sync skipped — no active Clerk session " +
        "(open the popup and ensure you're signed in on the syncHost).",
    );
    return;
  }

  // silent=true: popup is likely closed, skip progress messages.
  // importHistory writes lastHistorySync internally on successful import.
  await importHistory(undefined, true);
}
