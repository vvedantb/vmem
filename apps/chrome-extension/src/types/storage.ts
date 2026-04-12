import { DEFAULT_API_URL } from "@/lib/constants";

export interface ExtensionStorage {
  apiUrl: string;
  authToken: string;
  selectionPopupEnabled: boolean;
}

export const STORAGE_DEFAULTS: ExtensionStorage = {
  apiUrl: DEFAULT_API_URL,
  authToken: "",
  selectionPopupEnabled: true,
};
