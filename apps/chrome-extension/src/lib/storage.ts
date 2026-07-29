import { storage } from "wxt/utils/storage";
import type { WxtStorageItem } from "wxt/utils/storage";
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

// pair each storage key with its wxt item so setStorage stays type safe
type StorageEntry<K extends keyof ExtensionStorage> = {
  key: K;
  item: WxtStorageItem<ExtensionStorage[K], Record<string, never>>;
};
type AnyStorageEntry = {
  [K in keyof ExtensionStorage]: StorageEntry<K>;
}[keyof ExtensionStorage];

const STORAGE_ENTRIES = [
  { key: "selectionPopupEnabled", item: selectionPopupEnabledItem },
  { key: "lastBookmarkSync", item: lastBookmarkSyncItem },
  { key: "lastHistorySync", item: lastHistorySyncItem },
  { key: "autoSyncEnabled", item: autoSyncEnabledItem },
  { key: "autoSyncIntervalMinutes", item: autoSyncIntervalMinutesItem },
  { key: "defaultProfileId", item: defaultProfileIdItem },
  { key: "autoSearchEnabled", item: autoSearchEnabledItem },
  { key: "autoCaptureEnabled", item: autoCaptureEnabledItem },
  { key: "lastSyncAttemptAt", item: lastSyncAttemptAtItem },
  { key: "lastSyncSkipReason", item: lastSyncSkipReasonItem },
] satisfies readonly AnyStorageEntry[];

// fail the build when a new ExtensionStorage field is not registered above
type Assert<T extends true> = T;
type _AllFieldsRegistered = Assert<
  Exclude<
    keyof ExtensionStorage,
    (typeof STORAGE_ENTRIES)[number]["key"]
  > extends never
    ? true
    : false
>;

function toStorageUpdate<K extends keyof ExtensionStorage>(
  entry: StorageEntry<K>,
  partial: Partial<ExtensionStorage>,
) {
  const value = partial[entry.key];
  if (value === undefined) return undefined;
  return { item: entry.item, value };
}

export async function setStorage(
  partial: Partial<ExtensionStorage>,
): Promise<void> {
  const updates = STORAGE_ENTRIES.map((entry) =>
    toStorageUpdate(entry, partial),
  ).filter((update) => update !== undefined);

  if (updates.length === 0) return;
  await storage.setItems(updates);
}

export async function getAuthToken(): Promise<string> {
  return authTokenItem.getValue();
}

export async function setAuthToken(token: string): Promise<void> {
  await authTokenItem.setValue(token);
}
