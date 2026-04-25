import { registerContextMenu, savePageFromTab } from "./context-menu";
import { registerMessageHandler } from "./message-handler";
import {
  startAutoSync,
  stopAutoSync,
  registerAlarmListener,
  ensureSettingsMirrorAlarm,
} from "./sync-scheduler";
import { refreshUserSettingsMirrorFromConvex } from "./user-settings-mirror";
import { getStorage } from "@/lib/storage";
import { initializeEnrichment } from "./enrichment-router";
import { drainPendingEnrichmentQueue } from "./pending-enrichment-drain";

// Handle keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-page") {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id && tab.url) {
        console.log("[vmem] Keyboard shortcut: saving page", tab.url);
        await savePageFromTab(tab);
      }
    } catch (err) {
      console.error("[vmem] Keyboard shortcut save failed:", err);
    }
  }
});

// CRITICAL: Register alarm listener at top level so it's ready when
// service worker wakes up from an alarm. Service workers can restart
// at any time, but alarms persist — listener must be registered synchronously.
registerAlarmListener();

chrome.runtime.onInstalled.addListener(async (details) => {
  // Open welcome page on first install
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }

  registerContextMenu();
  await refreshUserSettingsMirrorFromConvex();
  ensureSettingsMirrorAlarm();
  await initAutoSync();
  await initializeEnrichment();
  void drainPendingEnrichmentQueue();
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshUserSettingsMirrorFromConvex();
  ensureSettingsMirrorAlarm();
  await initAutoSync();
  await initializeEnrichment();
  void drainPendingEnrichmentQueue();
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
