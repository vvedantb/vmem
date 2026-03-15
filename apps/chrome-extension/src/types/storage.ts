export interface ExtensionStorage {
  apiUrl: string;
  apiKey: string;
  userId: string;
}

export const STORAGE_DEFAULTS: ExtensionStorage = {
  apiUrl: "http://localhost:3001",
  apiKey: "",
  userId: "",
};
