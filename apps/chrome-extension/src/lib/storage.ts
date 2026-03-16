import type { ExtensionStorage } from "@/types/storage";
import { STORAGE_DEFAULTS } from "@/types/storage";

export async function getStorage(): Promise<ExtensionStorage> {
  const result = await chrome.storage.local.get(STORAGE_DEFAULTS);
  return result as ExtensionStorage;
}

export async function setStorage(
  partial: Partial<ExtensionStorage>,
): Promise<void> {
  await chrome.storage.local.set(partial);
}
