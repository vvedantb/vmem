import { getStorage } from "@/lib/storage";
import {
  DEFAULT_SYNC_INTERVAL_MINUTES,
  MAX_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_INTERVAL_MINUTES,
} from "@/lib/constants";

export const HISTORY_ALARM_NAME = "vmem-history-sync";

/**
 * Read the user-configured history-sync period (minutes), clamped to the
 * supported range. The popup writes this (mirrored from Convex); a missing,
 * stale, or out-of-range value falls back to the default rather than handing
 * `chrome.alarms.create` an invalid period.
 */
export async function getHistorySyncIntervalMinutes(): Promise<number> {
  const { autoSyncIntervalMinutes } = await getStorage();
  if (!Number.isFinite(autoSyncIntervalMinutes)) {
    return DEFAULT_SYNC_INTERVAL_MINUTES;
  }
  return Math.min(
    MAX_SYNC_INTERVAL_MINUTES,
    Math.max(MIN_SYNC_INTERVAL_MINUTES, Math.round(autoSyncIntervalMinutes)),
  );
}

export const BADGE_TICK_ALARM_NAME = "vmem-sync-badge-tick";
const BADGE_TICK_INTERVAL_MINUTES = 1;
/** Matches the popup's --accent token (near-black, monochrome brand). */
const BADGE_BACKGROUND_COLOR = "#363636";

async function ensureBadgeTickAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(BADGE_TICK_ALARM_NAME);
  if (existing) return;
  await chrome.alarms.create(BADGE_TICK_ALARM_NAME, {
    periodInMinutes: BADGE_TICK_INTERVAL_MINUTES,
  });
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
  // Keep the badge to ~3 chars: switch to whole hours past the hour mark, so a
  // long sync interval shows "6h" rather than "359m".
  const text = minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`;
  await chrome.action.setBadgeBackgroundColor({
    color: BADGE_BACKGROUND_COLOR,
  });
  await chrome.action.setBadgeText({ text });
}

/**
 * Ensure the history-sync alarm is scheduled at the configured period.
 * `chrome.alarms.create` with an existing name CANCELS and REPLACES the alarm,
 * resetting its timer. If the user restarts Chrome more often than the sync
 * interval (e.g. laptop reboot, profile reload), repeatedly calling create
 * would mean the alarm never reaches its fire time — so we create only when
 * absent, and otherwise recreate ONLY when the configured period actually
 * changed (the user moved the frequency slider). An unchanged period is left
 * untouched so the timer is never reset. This runs on every heartbeat/badge
 * tick, so it must stay idempotent for an unchanged period.
 */
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

/**
 * React to a sync-period change (e.g. the popup frequency slider): reschedule
 * the history alarm with the new period — but only while auto-sync is enabled,
 * so a disabled extension never gets a live alarm. `startAutoSync` recreates
 * the alarm only when the period differs, so this is safe to call on any write.
 */
export async function rescheduleHistorySync(): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  if (!autoSyncEnabled) return;
  await startAutoSync();
}

/** Clear the periodic history alarm (and the badge countdown driven by it).
 * Bookmark listener stays wired — its handler checks the autoSyncEnabled
 * flag at call time. */
export async function stopAutoSync(): Promise<void> {
  await chrome.alarms.clear(HISTORY_ALARM_NAME);
  await chrome.alarms.clear(BADGE_TICK_ALARM_NAME);
  await updateSyncBadge();
}
