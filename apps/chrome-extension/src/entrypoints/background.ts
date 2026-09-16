import { defineBackground } from "wxt/utils/define-background";
import {
  registerContextMenuClickListener,
  savePageFromTab,
} from "@/background/context-menu";
import {
  handleCommand,
  registerCommandListener,
} from "@/background/command-handler";
import { registerMessageHandler } from "@/background/message-handler";
import {
  registerAlarmListener,
  registerBookmarkListener,
  rescheduleHistorySync,
  startAutoSync,
  stopAutoSync,
} from "@/background/sync-scheduler";
import { runBackgroundBootstrap } from "@/background/bootstrap";
import { registerSyncHostCookieListener } from "@/background/sync-host-cookie-listener";
import { setConvexTokenRefresher } from "@/background/auth";
import { refreshConvexTokenFromClerk } from "@/lib/refresh-convex-token";
import {
  autoSyncEnabledItem,
  autoSyncIntervalMinutesItem,
} from "@/lib/storage";

declare global {
  var __vmemHandleCommand: typeof handleCommand | undefined;
  var __vmemSaveTab: typeof savePageFromTab | undefined;
}

export default defineBackground(() => {
  setConvexTokenRefresher(refreshConvexTokenFromClerk);

  registerAlarmListener();
  registerBookmarkListener();
  registerSyncHostCookieListener();
  registerContextMenuClickListener();
  registerCommandListener();
  registerMessageHandler();

  // live e2e invokes the same path as Alt+S when OS shortcuts do not fire
  globalThis.__vmemHandleCommand = handleCommand;
  globalThis.__vmemSaveTab = savePageFromTab;

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

  autoSyncEnabledItem.watch((enabled) => {
    if (enabled) {
      void startAutoSync();
    } else {
      void stopAutoSync();
    }
  });

  autoSyncIntervalMinutesItem.watch(() => {
    void rescheduleHistorySync();
  });
});
