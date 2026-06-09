export interface ExtensionStorage {
  selectionPopupEnabled: boolean;
  lastBookmarkSync: number; // epoch ms, 0 = never synced
  lastHistorySync: number; // epoch ms, 0 = never synced
  autoSyncEnabled: boolean;
  defaultProfileId: string; // Default profile for saving memories
  autoSearchEnabled: boolean; // Auto-search memories while typing in AI chats
  autoCaptureEnabled: boolean; // Auto-capture prompts sent to AI chats
  // Sync-health diagnostics — every alarm/catch-up attempt records here so a
  // silent gap (auth lost, alarm dropped) is visible in the popup/debug report
  // instead of looking healthy. See sync-scheduler.handleHistoryAlarm.
  lastSyncAttemptAt: number; // epoch ms of the most recent sync attempt, 0 = never
  lastSyncSkipReason: string; // why the last attempt did not sync ("" = synced ok)
}

export const STORAGE_DEFAULTS: ExtensionStorage = {
  selectionPopupEnabled: true,
  lastBookmarkSync: 0,
  lastHistorySync: 0,
  autoSyncEnabled: true,
  defaultProfileId: "", // Empty = use user's default profile
  autoSearchEnabled: true, // On by default — core feature
  autoCaptureEnabled: false, // Off by default — opt-in
  lastSyncAttemptAt: 0,
  lastSyncSkipReason: "",
};
