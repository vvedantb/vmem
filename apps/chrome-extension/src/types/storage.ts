export interface ExtensionStorage {
  authToken: string;
  selectionPopupEnabled: boolean;
  lastBookmarkSync: number; // epoch ms, 0 = never synced
  lastHistorySync: number; // epoch ms, 0 = never synced
  autoSyncEnabled: boolean;
  localEnrichmentEnabled: boolean; // Use local LLM for tag generation
  defaultProfileId: string; // Default profile for saving memories
}

export const STORAGE_DEFAULTS: ExtensionStorage = {
  authToken: "",
  selectionPopupEnabled: true,
  lastBookmarkSync: 0,
  lastHistorySync: 0,
  autoSyncEnabled: true,
  localEnrichmentEnabled: true, // Default to local enrichment
  defaultProfileId: "", // Empty = use user's default profile
};
