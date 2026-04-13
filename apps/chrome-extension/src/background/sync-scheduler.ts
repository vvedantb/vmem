import { syncSingleBookmark } from "./import-bookmarks";
import { importHistory } from "./import-history";
import { getStorage } from "@/lib/storage";

const HISTORY_ALARM_NAME = "vmem-history-sync";
const HISTORY_SYNC_INTERVAL_MINUTES = 30;

/** Stored so stopAutoSync can remove the exact listener reference. */
let bookmarkListener:
  | ((id: string, bookmark: chrome.bookmarks.BookmarkTreeNode) => void)
  | null = null;

let alarmListener: ((alarm: chrome.alarms.Alarm) => void) | null = null;

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
  chrome.alarms.create(HISTORY_ALARM_NAME, {
    periodInMinutes: HISTORY_SYNC_INTERVAL_MINUTES,
  });

  if (!alarmListener) {
    alarmListener = (alarm) => {
      if (alarm.name !== HISTORY_ALARM_NAME) return;
      void handleHistoryAlarm();
    };
    chrome.alarms.onAlarm.addListener(alarmListener);
  }
}

/** Stop auto-sync: remove bookmark listener + clear history alarm. */
export function stopAutoSync(): void {
  if (bookmarkListener) {
    chrome.bookmarks.onCreated.removeListener(bookmarkListener);
    bookmarkListener = null;
  }

  if (alarmListener) {
    chrome.alarms.onAlarm.removeListener(alarmListener);
    alarmListener = null;
  }

  void chrome.alarms.clear(HISTORY_ALARM_NAME);
}

/** Called by alarm — checks auth + auto-sync setting before syncing. */
async function handleHistoryAlarm(): Promise<void> {
  const { autoSyncEnabled, authToken } = await getStorage();
  if (!autoSyncEnabled || !authToken) return;

  // silent=true: popup is likely closed, skip progress messages
  await importHistory(undefined, true);
}
