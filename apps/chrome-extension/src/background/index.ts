import { markBootPhase } from "./boot-marker";
import { registerContextMenuClickListener } from "./context-menu";
import { registerCommandListener } from "./command-handler";
import { registerMessageHandler } from "./message-handler";
import {
  registerAlarmListener,
  registerBookmarkListener,
  rescheduleHistorySync,
  startAutoSync,
  stopAutoSync,
} from "./sync-scheduler";
import { runBackgroundBootstrap } from "./bootstrap";
import { registerSyncHostCookieListener } from "./sync-host-cookie-listener";

registerAlarmListener();
registerBookmarkListener();
registerSyncHostCookieListener();
registerContextMenuClickListener();
registerCommandListener();
registerMessageHandler();
markBootPhase("listeners-ready");

void runBackgroundBootstrap();

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
  void runBackgroundBootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void runBackgroundBootstrap();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  const autoSyncChange = changes["autoSyncEnabled"];
  if (autoSyncChange) {
    if (autoSyncChange.newValue === true) {
      void startAutoSync();
    } else {
      void stopAutoSync();
    }
    return;
  }

  // The frequency slider changed the sync period — reschedule the alarm with
  // the new period (no-op while auto-sync is disabled).
  if (changes["autoSyncIntervalMinutes"]) {
    void rescheduleHistorySync();
  }
});
