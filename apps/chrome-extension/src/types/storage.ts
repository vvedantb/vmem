import { z } from "zod";
import type { ExtensionUserSettings } from "./api";

export const extensionStorageSchema = z.object({
  selectionPopupEnabled: z.boolean(),
  lastBookmarkSync: z.number(), // epoch ms 0 = never synced
  lastHistorySync: z.number(), // epoch ms 0 = never synced
  autoSyncEnabled: z.boolean(),
  autoSyncIntervalMinutes: z.number(), // history sync period (min)
  defaultProfileId: z.string(), // default profile for saving memories
  autoSearchEnabled: z.boolean(), // auto search memories while typing in ai chats
  autoCaptureEnabled: z.boolean(), // auto capture prompts sent to ai chats
  // sync health diagnostics every alarm or catch up attempt records here so a
  // silent gap is visible in the popup sync status
  // instead of looking healthy see sync-scheduler.handleHistoryAlarm
  lastSyncAttemptAt: z.number(), // epoch ms of the most recent sync attempt 0 = never
  lastSyncSkipReason: z.string(), // why the last attempt did not sync ("" = synced ok)
});

export type ExtensionStorage = z.infer<typeof extensionStorageSchema>;

// chrome.storage ↔ convex userSettings field map (sw can't subscribe to convex)
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

export const STORAGE_DEFAULTS: ExtensionStorage = {
  selectionPopupEnabled: true,
  lastBookmarkSync: 0,
  lastHistorySync: 0,
  autoSyncEnabled: true,
  autoSyncIntervalMinutes: 30, // every 30 min by default
  defaultProfileId: "", // empty = use user's default profile
  autoSearchEnabled: true, // on by default core feature
  autoCaptureEnabled: false, // off by default opt in
  lastSyncAttemptAt: 0,
  lastSyncSkipReason: "",
};
