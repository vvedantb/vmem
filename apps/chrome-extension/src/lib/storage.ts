import { storage } from "wxt/utils/storage";
import type { ExtensionStorage } from "@/types/storage";

export const selectionPopupEnabledItem = storage.defineItem<boolean>(
  "local:selectionPopupEnabled",
  { fallback: true },
);

export const lastBookmarkSyncItem = storage.defineItem<number>(
  "local:lastBookmarkSync",
  { fallback: 0 },
);

export const lastHistorySyncItem = storage.defineItem<number>(
  "local:lastHistorySync",
  { fallback: 0 },
);

export const autoSyncEnabledItem = storage.defineItem<boolean>(
  "local:autoSyncEnabled",
  { fallback: true },
);

export const autoSyncIntervalMinutesItem = storage.defineItem<number>(
  "local:autoSyncIntervalMinutes",
  { fallback: 30 },
);

export const defaultProfileIdItem = storage.defineItem<string>(
  "local:defaultProfileId",
  { fallback: "" },
);

export const autoSearchEnabledItem = storage.defineItem<boolean>(
  "local:autoSearchEnabled",
  { fallback: true },
);

export const autoCaptureEnabledItem = storage.defineItem<boolean>(
  "local:autoCaptureEnabled",
  { fallback: false },
);

const lastSyncAttemptAtItem = storage.defineItem<number>(
  "local:lastSyncAttemptAt",
  { fallback: 0 },
);

const lastSyncSkipReasonItem = storage.defineItem<string>(
  "local:lastSyncSkipReason",
  { fallback: "" },
);

const authTokenItem = storage.defineItem<string>("session:authToken", {
  fallback: "",
});

export async function getStorage(): Promise<ExtensionStorage> {
  const [
    selectionPopupEnabled,
    lastBookmarkSync,
    lastHistorySync,
    autoSyncEnabled,
    autoSyncIntervalMinutes,
    defaultProfileId,
    autoSearchEnabled,
    autoCaptureEnabled,
    lastSyncAttemptAt,
    lastSyncSkipReason,
  ] = await Promise.all([
    selectionPopupEnabledItem.getValue(),
    lastBookmarkSyncItem.getValue(),
    lastHistorySyncItem.getValue(),
    autoSyncEnabledItem.getValue(),
    autoSyncIntervalMinutesItem.getValue(),
    defaultProfileIdItem.getValue(),
    autoSearchEnabledItem.getValue(),
    autoCaptureEnabledItem.getValue(),
    lastSyncAttemptAtItem.getValue(),
    lastSyncSkipReasonItem.getValue(),
  ]);

  return {
    selectionPopupEnabled,
    lastBookmarkSync,
    lastHistorySync,
    autoSyncEnabled,
    autoSyncIntervalMinutes,
    defaultProfileId,
    autoSearchEnabled,
    autoCaptureEnabled,
    lastSyncAttemptAt,
    lastSyncSkipReason,
  };
}

export async function setStorage(
  partial: Partial<ExtensionStorage>,
): Promise<void> {
  const updates: Array<
    | { item: typeof selectionPopupEnabledItem; value: boolean }
    | { item: typeof lastBookmarkSyncItem; value: number }
    | { item: typeof lastHistorySyncItem; value: number }
    | { item: typeof autoSyncEnabledItem; value: boolean }
    | { item: typeof autoSyncIntervalMinutesItem; value: number }
    | { item: typeof defaultProfileIdItem; value: string }
    | { item: typeof autoSearchEnabledItem; value: boolean }
    | { item: typeof autoCaptureEnabledItem; value: boolean }
    | { item: typeof lastSyncAttemptAtItem; value: number }
    | { item: typeof lastSyncSkipReasonItem; value: string }
  > = [];

  if (partial.selectionPopupEnabled !== undefined) {
    updates.push({
      item: selectionPopupEnabledItem,
      value: partial.selectionPopupEnabled,
    });
  }
  if (partial.lastBookmarkSync !== undefined) {
    updates.push({
      item: lastBookmarkSyncItem,
      value: partial.lastBookmarkSync,
    });
  }
  if (partial.lastHistorySync !== undefined) {
    updates.push({
      item: lastHistorySyncItem,
      value: partial.lastHistorySync,
    });
  }
  if (partial.autoSyncEnabled !== undefined) {
    updates.push({
      item: autoSyncEnabledItem,
      value: partial.autoSyncEnabled,
    });
  }
  if (partial.autoSyncIntervalMinutes !== undefined) {
    updates.push({
      item: autoSyncIntervalMinutesItem,
      value: partial.autoSyncIntervalMinutes,
    });
  }
  if (partial.defaultProfileId !== undefined) {
    updates.push({
      item: defaultProfileIdItem,
      value: partial.defaultProfileId,
    });
  }
  if (partial.autoSearchEnabled !== undefined) {
    updates.push({
      item: autoSearchEnabledItem,
      value: partial.autoSearchEnabled,
    });
  }
  if (partial.autoCaptureEnabled !== undefined) {
    updates.push({
      item: autoCaptureEnabledItem,
      value: partial.autoCaptureEnabled,
    });
  }
  if (partial.lastSyncAttemptAt !== undefined) {
    updates.push({
      item: lastSyncAttemptAtItem,
      value: partial.lastSyncAttemptAt,
    });
  }
  if (partial.lastSyncSkipReason !== undefined) {
    updates.push({
      item: lastSyncSkipReasonItem,
      value: partial.lastSyncSkipReason,
    });
  }

  if (updates.length === 0) return;
  await storage.setItems(updates);
}

export async function getAuthToken(): Promise<string> {
  return authTokenItem.getValue();
}

export async function setAuthToken(token: string): Promise<void> {
  await authTokenItem.setValue(token);
}
