import type { OptimisticLocalStore } from "convex/browser";
import { api, type Id } from "@vmem/backend";
import type { Connector } from "./connector-utils";

const LIST_ARGS = {} as const;

const DISCONNECTED_CONNECTOR_PATCH = {
  connectionStatus: "disconnected",
  syncStatus: "idle",
  syncProgress: 0,
  itemsSynced: 0,
  lastSyncAt: undefined,
  errorMessage: undefined,
} as const satisfies Partial<Connector>;

function getConnectorList(localStore: OptimisticLocalStore) {
  return localStore.getQuery(api.connectors.crud.listMy, LIST_ARGS);
}

function setConnectorList(localStore: OptimisticLocalStore, next: Connector[]) {
  localStore.setQuery(api.connectors.crud.listMy, LIST_ARGS, next);
}

function patchConnectorInList(
  localStore: OptimisticLocalStore,
  connectorId: Id<"connectors">,
  patch: Partial<Connector>,
) {
  const list = getConnectorList(localStore);
  if (!list) return;
  setConnectorList(
    localStore,
    list.map((connector) =>
      connector._id === connectorId ? { ...connector, ...patch } : connector,
    ),
  );
}

export function optimisticallyDisconnectConnector(
  localStore: OptimisticLocalStore,
  connectorId: Id<"connectors">,
): void {
  patchConnectorInList(localStore, connectorId, DISCONNECTED_CONNECTOR_PATCH);
}
