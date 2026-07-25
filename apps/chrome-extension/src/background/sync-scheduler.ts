import { api } from "@vmem/backend";
import { getStorage, setStorage } from "@/lib/storage";
import { errorMessage } from "@/lib/error";
import { convexSettingsToStorageMirror } from "@/types/storage";
import {
  DEFAULT_SYNC_INTERVAL_MINUTES,
  MAX_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_INTERVAL_MINUTES,
} from "@/lib/constants";
import { importBookmarks, syncSingleBookmark } from "./import-bookmarks";
import { importHistory } from "./import-history";
import {
  createAuthenticatedConvexClient,
  hasActiveClerkSession,
  warmBackgroundAuth,
} from "./auth";

export const HISTORY_ALARM_NAME = "vmem-history-sync";
export const BADGE_TICK_ALARM_NAME = "vmem-sync-badge-tick";
export const SETTINGS_MIRROR_ALARM_NAME = "vmem-user-settings-mirror";

const BADGE_TICK_INTERVAL_MINUTES = 1;
// matches popup accent color
const BADGE_BACKGROUND_COLOR = "#363636";
const SETTINGS_MIRROR_INTERVAL_MINUTES = 5;
const CATCHUP_MIN_INTERVAL_MS = 5 * 60 * 1000;

let alarmListenerRegistered = false;
let lastCatchUpAttemptMs = 0;
let bookmarkListenerRegistered = false;
let historySyncInProgress = false;

// clamped sync interval minutes from chrome.storage
async function getHistorySyncIntervalMinutes(): Promise<number> {
  const { autoSyncIntervalMinutes } = await getStorage();
  if (!Number.isFinite(autoSyncIntervalMinutes)) {
    return DEFAULT_SYNC_INTERVAL_MINUTES;
  }
  return Math.min(
    MAX_SYNC_INTERVAL_MINUTES,
    Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(autoSyncIntervalMinutes)),
  );
}

async function ensureBadgeTickAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(BADGE_TICK_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(BADGE_TICK_ALARM_NAME, {
    periodInMinutes: BADGE_TICK_INTERVAL_MINUTES,
  });
}

// badge countdown from the real history alarm's scheduledTime
async function updateSyncBadge(): Promise<void> {
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
  // prefer "6h" over "359m"
  const text = minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`;
  await chrome.action.setBadgeBackgroundColor({
    color: BADGE_BACKGROUND_COLOR,
  });
  await chrome.action.setBadgeText({ text });
}

// ensure history alarm exists only recreate when period changes
export async function startAutoSync(): Promise<void> {
  await ensureBadgeTickAlarm();
  const intervalMinutes = await getHistorySyncIntervalMinutes();
  const existing = await chrome.alarms.get(HISTORY_ALARM_NAME);
  if (!existing || existing.periodInMinutes !== intervalMinutes) {
    await chrome.alarms.create(HISTORY_ALARM_NAME, {
      periodInMinutes: intervalMinutes,
    });
  }
  await updateSyncBadge();
}

// reschedule history alarm after frequency change (if auto sync on)
export async function rescheduleHistorySync(): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) return;
  await startAutoSync();
}

// clear history + badge alarms bookmark listener stays wired
export async function stopAutoSync(): Promise<void> {
  await chrome.alarms.clear(HISTORY_ALARM_NAME);
  await chrome.alarms.clear(BADGE_TICK_ALARM_NAME);
  await updateSyncBadge();
}

async function reconcileAutoSyncAlarm(enabled: boolean): Promise<void> {
  if (enabled) {
    await startAutoSync();
  } else {
    await stopAutoSync();
  }
}

export async function refreshUserSettingsMirrorFromConvex(): Promise<void> {
  const client = await createAuthenticatedConvexClient();
  if (!client) {
    return;
  }

  try {
    const settings = await client.query(api.userSettings.get, {});
    const mirrored = convexSettingsToStorageMirror(settings);
    await setStorage(mirrored);
    await reconcileAutoSyncAlarm(mirrored.autoSyncEnabled);
  } catch {
    return;
  }
}

// top level alarm listener must register synchronously on sw start
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

// 5m watchdog: refresh settings heal dropped history alarm catch up
async function handleHeartbeat(): Promise<void> {
  void refreshUserSettingsMirrorFromConvex();

  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) return;

  // idempotent won't reset an existing alarm's timer
  await startAutoSync();
  await catchUpHistorySyncIfOverdue();
}

// top level bookmark listener must register synchronously every sw wake
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

// 1m badge tick + history alarm heal while auto sync is on
async function handleBadgeTick(): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) {
    await chrome.alarms.clear(BADGE_TICK_ALARM_NAME);
    await updateSyncBadge();
    return;
  }
  await startAutoSync(); // heals dropped history alarm + updates badge
}

// ensure sync alarms exist on every sw start (not just install/startup)
export async function bootstrapSyncSchedulers(): Promise<void> {
  await ensureSettingsMirrorAlarm();
  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) {
    await updateSyncBadge();
    return;
  }

  await startAutoSync();
  void warmBackgroundAuth();
  void catchUpHistorySyncIfOverdue();
}

// run history sync now if last sync is older than the interval
export async function catchUpHistorySyncIfOverdue(): Promise<void> {
  const { autoSyncEnabled, lastHistorySync } = await getStorage();
  if (!autoSyncEnabled) return;

  const intervalMs = (await getHistorySyncIntervalMinutes()) * 60 * 1000;
  const overdue =
    lastHistorySync === 0 || Date.now() - lastHistorySync > intervalMs;
  if (!overdue) return;

  const now = Date.now();
  if (now - lastCatchUpAttemptMs < CATCHUP_MIN_INTERVAL_MS) return;
  lastCatchUpAttemptMs = now;

  await handleHistoryAlarm();
}

// manual/debug entry same path as the history alarm
export async function runAutoSyncNow(): Promise<void> {
  await handleHistoryAlarm();
}

// persist last sync attempt (+ skip reason) for popup/debug
async function recordSyncAttempt(reason: string): Promise<void> {
  await setStorage({
    lastSyncAttemptAt: Date.now(),
    lastSyncSkipReason: reason,
  });
}

// history alarm handler checks auth + auto sync before syncing
// AI-generated (Claude), prompt: "mv3 alarm driven history bookmark autosync with catchup"
// Modified by me: skip reasons auth warm and in progress guard
async function handleHistoryAlarm(): Promise<void> {
  if (historySyncInProgress) {
    await recordSyncAttempt("in-progress");
    return;
  }

  historySyncInProgress = true;

  try {
    console.info("[vmem] History sync alarm fired");
    // keep heartbeat alive so either alarm can resurrect the other
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
    const message = errorMessage(error);
    await recordSyncAttempt(`error: ${message}`);
    console.error("[vmem] History sync failed:", message);
  } finally {
    historySyncInProgress = false;
    // reset the countdown after a fire the alarm's scheduledTime is the
    // next full interval away
    void updateSyncBadge();
  }
}

// drive an alarm handler by name and await it mirrors live onAlarm dispatch
// but returns the promise so callers/tests can await the full sync + watchdog
// cycle no op for unknown names
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
