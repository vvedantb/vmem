import type { ExtensionUserSettings } from "./api";

export type ExtensionStorage = {
  selectionPopupEnabled: boolean;
  lastBookmarkSync: number; // epoch ms: 0 = never synced
  lastHistorySync: number; // epoch ms: 0 = never synced
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number; // history sync period (min)
  defaultProfileId: string; // default profile for saving memories
  autoSearchEnabled: boolean; // auto-search memories while typing in ai-chat
  autoCaptureEnabled: boolean; // auto-capture prompts sent to ai-chat
  // record every attempt so popup can show silent sync gaps
  lastSyncAttemptAt: number; // epoch ms: most recent sync attempt, 0 = never
  lastSyncSkipReason: string; // skip reason: why last attempt did not sync ("" = ok)
};

// chrome.storage mirror of convex userSettings because sw cannot subscribe
const _CONVEX_SETTINGS_MIRROR = {
  autoSyncEnabled: "extensionAutoSyncEnabled",
  autoSyncIntervalMinutes: "extensionAutoSyncIntervalMinutes",
  selectionPopupEnabled: "extensionSelectionPopupEnabled",
} as const satisfies {
  readonly [K in keyof Pick<
    ExtensionStorage,
    "autoSyncEnabled" | "autoSyncIntervalMinutes" | "selectionPopupEnabled"
  >]: keyof ExtensionUserSettings;
};

export type MirroredStorageKey = keyof typeof _CONVEX_SETTINGS_MIRROR;

type MirroredConvexKey = (typeof _CONVEX_SETTINGS_MIRROR)[MirroredStorageKey];

type StorageMirrorSettings = Pick<ExtensionUserSettings, MirroredConvexKey> & {
  defaultProfiles: ExtensionUserSettings["defaultProfiles"];
};

// map convex userSettings into the chrome.storage mirror subset
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
