import { DEFAULT_API_URL } from "@/lib/constants";

export interface ExtensionStorage {
  apiUrl: string;
}

export const STORAGE_DEFAULTS: ExtensionStorage = {
  apiUrl: DEFAULT_API_URL,
};
