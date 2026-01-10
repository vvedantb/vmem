// Shared in-memory store for connectors mock data
// This simulates a database for development purposes

export type SyncStatus = "idle" | "syncing" | "error";
export type ConnectionStatus = "connected" | "disconnected";

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: string; // Icon name from tabler
  connectionStatus: ConnectionStatus;
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  syncProgress: number; // 0-100
  itemsSynced: number;
  errorMessage: string | null;
}

export const connectors: Connector[] = [
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Connect your Google Drive to import documents and files",
    icon: "IconBrandGoogleDrive",
    connectionStatus: "connected",
    syncStatus: "idle",
    lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    syncProgress: 0,
    itemsSynced: 142,
    errorMessage: null,
  },
  {
    id: "onedrive",
    name: "OneDrive",
    description: "Sync files from your Microsoft OneDrive account",
    icon: "IconBrandOnedrive",
    connectionStatus: "disconnected",
    syncStatus: "idle",
    lastSyncAt: null,
    syncProgress: 0,
    itemsSynced: 0,
    errorMessage: null,
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Import files and folders from Dropbox",
    icon: "IconBrandDropbox",
    connectionStatus: "disconnected",
    syncStatus: "idle",
    lastSyncAt: null,
    syncProgress: 0,
    itemsSynced: 0,
    errorMessage: null,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Sync pages and databases from your Notion workspace",
    icon: "IconBrandNotion",
    connectionStatus: "disconnected",
    syncStatus: "idle",
    lastSyncAt: null,
    syncProgress: 0,
    itemsSynced: 0,
    errorMessage: null,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Import messages and files from Slack channels",
    icon: "IconBrandSlack",
    connectionStatus: "disconnected",
    syncStatus: "idle",
    lastSyncAt: null,
    syncProgress: 0,
    itemsSynced: 0,
    errorMessage: null,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Connect repositories to index code and documentation",
    icon: "IconBrandGithub",
    connectionStatus: "connected",
    syncStatus: "idle",
    lastSyncAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    syncProgress: 0,
    itemsSynced: 87,
    errorMessage: null,
  },
];

// Track sync simulation intervals for cleanup
export const syncSimulations = new Map<string, NodeJS.Timeout>();
