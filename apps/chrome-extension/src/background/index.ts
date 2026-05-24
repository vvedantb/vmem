import "./boot-marker";
import { markBootPhase } from "./boot-marker";
import {
  registerContextMenu,
  registerContextMenuClickListener,
} from "./context-menu";
import { registerCommandListener } from "./command-handler";
import { registerMessageHandler } from "./message-handler";
import {
  bootstrapSyncSchedulers,
  catchUpHistorySyncIfOverdue,
  registerAlarmListener,
  registerBookmarkListener,
  startAutoSync,
  stopAutoSync,
} from "./sync-scheduler";
import { refreshUserSettingsMirrorFromConvex } from "./user-settings-mirror";
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

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }

  registerContextMenu();
  await refreshUserSettingsMirrorFromConvex();
  await bootstrapSyncSchedulers();
  void catchUpHistorySyncIfOverdue();
});

chrome.runtime.onStartup.addListener(async () => {
  registerContextMenu();
  await refreshUserSettingsMirrorFromConvex();
  await bootstrapSyncSchedulers();
  void catchUpHistorySyncIfOverdue();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const autoSyncChange = changes["autoSyncEnabled"];
  if (!autoSyncChange) return;

  if (autoSyncChange.newValue === true) {
    void startAutoSync();
  } else {
    void stopAutoSync();
  }
});
