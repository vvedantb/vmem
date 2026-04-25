export interface ExtensionStorage {
  authToken: string;
  selectionPopupEnabled: boolean;
  lastBookmarkSync: number; // epoch ms, 0 = never synced
  lastHistorySync: number; // epoch ms, 0 = never synced
  autoSyncEnabled: boolean;
  localEnrichmentEnabled: boolean; // Use local LLM for tag generation
  defaultProfileId: string; // Default profile for saving memories
  autoSearchEnabled: boolean; // Auto-search memories while typing in AI chats
  autoCaptureEnabled: boolean; // Auto-capture prompts sent to AI chats
}

export const STORAGE_DEFAULTS: ExtensionStorage = {
  authToken: "",
  selectionPopupEnabled: true,
  lastBookmarkSync: 0,
  lastHistorySync: 0,
  autoSyncEnabled: true,
  localEnrichmentEnabled: true, // Default to local enrichment
  defaultProfileId: "", // Empty = use user's default profile
  autoSearchEnabled: true, // On by default — core feature
  autoCaptureEnabled: false, // Off by default — opt-in
};
