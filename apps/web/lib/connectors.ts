export type SyncStatus = "idle" | "syncing" | "error";
export type ConnectionStatus = "connected" | "disconnected";

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string;
  connectionStatus: ConnectionStatus;
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  syncProgress: number;
  itemsSynced: number;
  errorMessage: string | null;
}
