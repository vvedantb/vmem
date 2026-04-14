import { syncSingleBookmark } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { refreshUserSettingsMirrorFromConvex } from "./user-settings-mirror";
import { getStorage } from "@/lib/storage";

const HISTORY_ALARM_NAME = "vmem-history-sync";
const HISTORY_SYNC_INTERVAL_MINUTES = 30;

const SETTINGS_MIRROR_ALARM_NAME = "vmem-user-settings-mirror";
const SETTINGS_MIRROR_INTERVAL_MINUTES = 5;

/** Stored so stopAutoSync can remove the exact listener reference. */
let bookmarkListener:
  | ((id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => void)
  | null = null;

let alarmListenerRegistered = false;

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

export function ensureSettingsMirrorAlarm(): void {
  void chrome.alarms.create(SETTINGS_MIRROR_ALARM_NAME, {
    periodInMinutes: SETTINGS_MIRROR_INTERVAL_MINUTES,
  });
}

/**
 * Start auto-sync: real-time bookmark listener + periodic history alarm.
 * Idempotent — safe to call on every startup.
 */
export function startAutoSync(): void {
  // Bookmark: event-driven, sync on creation
  if (!bookmarkListener) {
    bookmarkListener = (id, bookmark) => {
      void syncSingleBookmark(id, bookmark);
    };
    chrome.bookmarks.onCreated.addListener(bookmarkListener);
  }

  // History: alarm-driven, every 30 min
  // Alarm listener is registered separately at SW top level
  chrome.alarms.create(HISTORY_ALARM_NAME, {
    periodInMinutes: HISTORY_SYNC_INTERVAL_MINUTES,
  });
}

/** Stop auto-sync: remove bookmark listener + clear history alarm. */
export function stopAutoSync(): void {
  if (bookmarkListener) {
    chrome.bookmarks.onCreated.removeListener(bookmarkListener);
    bookmarkListener = null;
  }

  // Clear the alarm but keep listener registered — alarm listener
  // checks autoSyncEnabled before acting, so it's safe to leave.
  void chrome.alarms.clear(HISTORY_ALARM_NAME);
}

/** Called by alarm — checks auth + auto-sync setting before syncing. */
async function handleHistoryAlarm(): Promise<void> {
  const { autoSyncEnabled, authToken } = await getStorage();
  if (!autoSyncEnabled || !authToken) return;

  // silent=true: popup is likely closed, skip progress messages
  await importHistory(undefined, true);
}
