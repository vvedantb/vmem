import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@vmem/backend";
import type { ApiKey } from "./types";

const LIST_ARGS = {} as const;

function getApiKeyList(localStore: OptimisticLocalStore) {
  return localStore.getQuery(api.apiKeys.listMy, LIST_ARGS);
}

function setApiKeyList(localStore: OptimisticLocalStore, next: ApiKey[]) {
  localStore.setQuery(api.apiKeys.listMy, LIST_ARGS, next);
}

export function patchApiKeyInList(
  localStore: OptimisticLocalStore,
  id: ApiKey["id"],
  patch: (row: ApiKey) => ApiKey,
) {
  const list = getApiKeyList(localStore);
  if (!list) return;
  setApiKeyList(
    localStore,
    list.map((row) => (row.id === id ? patch(row) : row)),
  );
}

export function removeApiKeyFromList(
  localStore: OptimisticLocalStore,
  id: ApiKey["id"],
) {
  const list = getApiKeyList(localStore);
  if (!list) return;
  setApiKeyList(
    localStore,
    list.filter((row) => row.id !== id),
  );
}
