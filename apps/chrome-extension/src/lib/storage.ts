import { z } from "zod";
import type { ExtensionStorage } from "@/types/storage";
import { STORAGE_DEFAULTS } from "@/types/storage";

const extensionStorageSchema = z.object({
  selectionPopupEnabled: z.boolean(),
  lastBookmarkSync: z.number(),
  lastHistorySync: z.number(),
  autoSyncEnabled: z.boolean(),
  autoSyncIntervalMinutes: z.number(),
  defaultProfileId: z.string(),
  autoSearchEnabled: z.boolean(),
  autoCaptureEnabled: z.boolean(),
  lastSyncAttemptAt: z.number(),
  lastSyncSkipReason: z.string(),
});

export async function getStorage(): Promise<ExtensionStorage> {
  const result = await chrome.storage.local.get(STORAGE_DEFAULTS);
  const parsed = extensionStorageSchema.safeParse(result);
  return parsed.success ? parsed.data : STORAGE_DEFAULTS;
}

export async function setStorage(
  partial: Partial<ExtensionStorage>,
): Promise<void> {
  await chrome.storage.local.set(partial);
}

// Auth token lives in chrome.storage.session — in-memory only, cleared on
// browser restart. The Convex JWT has a ~60s TTL anyway, so persisting it
// to disk via chrome.storage.local would mostly cache expired tokens while
// leaving them readable from the filesystem at rest.
export async function getAuthToken(): Promise<string> {
  const result = await chrome.storage.session.get({ authToken: "" });
  return typeof result.authToken === "string" ? result.authToken : "";
}

export async function setAuthToken(token: string): Promise<void> {
  await chrome.storage.session.set({ authToken: token });
}
