import { DEFAULT_API_URL } from "@/lib/constants";

export interface ExtensionStorage {
  apiUrl: string;
  authToken: string;
  selectionPopupEnabled: boolean;
  lastBookmarkSync: number; // epoch ms, 0 = never synced
  lastHistorySync: number; // epoch ms, 0 = never synced
  autoSyncEnabled: boolean;
}

export const STORAGE_DEFAULTS: ExtensionStorage = {
  apiUrl: DEFAULT_API_URL,
  authToken: "",
  selectionPopupEnabled: true,
  lastBookmarkSync: 0,
  lastHistorySync: 0,
  autoSyncEnabled: true,
};
