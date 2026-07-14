import type { ExtensionUserSettings } from "./api";

export interface ExtensionStorage {
  selectionPopupEnabled: boolean;
  lastBookmarkSync: number; // epoch ms, 0 = never synced
  lastHistorySync: number; // epoch ms, 0 = never synced
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number; // history-sync period (min)
  defaultProfileId: string; // Default profile for saving memories
  autoSearchEnabled: boolean; // Auto-search memories while typing in AI chats
  autoCaptureEnabled: boolean; // Auto-capture prompts sent to AI chats
  // Sync-health diagnostics — every alarm/catch-up attempt records here so a
  // silent gap (auth lost, alarm dropped) is visible in the popup/debug report
  // instead of looking healthy. See sync-scheduler.handleHistoryAlarm
  lastSyncAttemptAt: number; // epoch ms of the most recent sync attempt, 0 = never
  lastSyncSkipReason: string; // why the last attempt did not sync ("" = synced ok)
}

/**
 * chrome.storage ↔ convex userSettings field map (sw can't subscribe to convex).
 */
export const CONVEX_SETTINGS_MIRROR = {
  autoSyncEnabled: "extensionAutoSyncEnabled",
  autoSyncIntervalMinutes: "extensionAutoSyncIntervalMinutes",
  selectionPopupEnabled: "extensionSelectionPopupEnabled",
} as const satisfies {
  readonly [K in keyof Pick<
    ExtensionStorage,
    "autoSyncEnabled" | "autoSyncIntervalMinutes" | "selectionPopupEnabled"
  >]: keyof ExtensionUserSettings;
};

export type MirroredStorageKey = keyof typeof CONVEX_SETTINGS_MIRROR;

export type MirroredConvexKey =
  (typeof CONVEX_SETTINGS_MIRROR)[MirroredStorageKey];

/** Project Convex userSettings → the chrome.storage mirror subset. */
export function convexSettingsToStorageMirror(
  settings: Pick<ExtensionUserSettings, MirroredConvexKey>,
): Pick<ExtensionStorage, MirroredStorageKey> {
  return {
    autoSyncEnabled: settings.extensionAutoSyncEnabled,
    autoSyncIntervalMinutes: settings.extensionAutoSyncIntervalMinutes,
    selectionPopupEnabled: settings.extensionSelectionPopupEnabled,
  };
}

export const STORAGE_DEFAULTS: ExtensionStorage = {
  selectionPopupEnabled: true,
  lastBookmarkSync: 0,
  lastHistorySync: 0,
  autoSyncEnabled: true,
  autoSyncIntervalMinutes: 30, // every 30 min by default
  defaultProfileId: "", // Empty = use user's default profile
  autoSearchEnabled: true, // On by default — core feature
  autoCaptureEnabled: false, // Off by default — opt-in
  lastSyncAttemptAt: 0,
  lastSyncSkipReason: "",
};
