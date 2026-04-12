import { registerContextMenu } from "./context-menu";
import { registerMessageHandler } from "./message-handler";
import { startAutoSync, stopAutoSync } from "./sync-scheduler";
import { getStorage } from "@/lib/storage";

chrome.runtime.onInstalled.addListener(async () => {
  registerContextMenu();
  await initAutoSync();
});

// Service worker restarts clear listeners but alarms persist — re-register.
chrome.runtime.onStartup.addListener(async () => {
  await initAutoSync();
});

// React to user toggling auto-sync in the popup.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const autoSyncChange = changes["autoSyncEnabled"];
  if (!autoSyncChange) return;

  if (autoSyncChange.newValue === true) {
    startAutoSync();
  } else {
    stopAutoSync();
  }
});

registerMessageHandler();

async function initAutoSync(): Promise<void> {
  const { autoSyncEnabled } = await getStorage();
  if (autoSyncEnabled) {
    startAutoSync();
  }
}
