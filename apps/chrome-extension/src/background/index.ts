import { registerContextMenu } from "./context-menu";
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

// CRITICAL: Register alarm listener at top level so it's ready when
// service worker wakes up from an alarm. Service workers can restart
// at any time, but alarms persist — listener must be registered synchronously.
registerAlarmListener();

chrome.runtime.onInstalled.addListener(async () => {
  registerContextMenu();
  await refreshUserSettingsMirrorFromConvex();
  ensureSettingsMirrorAlarm();
  await initAutoSync();
  await initializeEnrichment();
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshUserSettingsMirrorFromConvex();
  ensureSettingsMirrorAlarm();
  await initAutoSync();
  await initializeEnrichment();
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
