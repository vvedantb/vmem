import type { ExtensionUserSettings } from "./api";

export type ExtensionStorage = {
  selectionPopupEnabled: boolean;
  lastBookmarkSync: number; // epoch ms 0 = never synced
  lastHistorySync: number; // epoch ms 0 = never synced
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number; // history sync period (min)
  defaultProfileId: string; // default profile for saving memories
  autoSearchEnabled: boolean; // auto search memories while typing in ai chats
  autoCaptureEnabled: boolean; // auto capture prompts sent to ai chats
  // sync health diagnostics every alarm or catch up attempt records here so a
  // silent gap is visible in the popup sync status
  // instead of looking healthy see sync-scheduler.handleHistoryAlarm
  lastSyncAttemptAt: number; // epoch ms of the most recent sync attempt 0 = never
  lastSyncSkipReason: string; // why the last attempt did not sync ("" = synced ok)
};

// chrome.storage ↔ convex userSettings field map (sw can't subscribe to convex)
const CONVEX_SETTINGS_MIRROR = {
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

type MirroredConvexKey = (typeof CONVEX_SETTINGS_MIRROR)[MirroredStorageKey];

type StorageMirrorSettings = Pick<ExtensionUserSettings, MirroredConvexKey> & {
  defaultProfiles: ExtensionUserSettings["defaultProfiles"];
};

// project convex userSettings → the chrome.storage mirror subset
export function convexSettingsToStorageMirror(
  settings: StorageMirrorSettings,
): Pick<ExtensionStorage, MirroredStorageKey | "defaultProfileId"> {
  return {
    autoSyncEnabled: settings.extensionAutoSyncEnabled,
    autoSyncIntervalMinutes: settings.extensionAutoSyncIntervalMinutes,
    selectionPopupEnabled: settings.extensionSelectionPopupEnabled,
    defaultProfileId: settings.defaultProfiles?.extension ?? "",
  };
}
