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
  harvestConvexTokenFromOpenVmemTabs,
  registerWebClerkTokenHarvest,
} from "@/background/harvest-web-clerk-token";
import { deleteMemory, getMemory, listMemories } from "@/background/api-client";
import {
  autoSyncEnabledItem,
  autoSyncIntervalMinutesItem,
  getAuthToken,
} from "@/lib/storage";

declare global {
  var __vmemHandleCommand: typeof handleCommand | undefined;
  var __vmemSaveTab: typeof savePageFromTab | undefined;
  var __vmemHarvestToken: typeof harvestConvexTokenFromOpenVmemTabs | undefined;
  var __vmemListMemories: typeof listMemories | undefined;
  var __vmemGetMemory: typeof getMemory | undefined;
  var __vmemDeleteMemory: typeof deleteMemory | undefined;
  var __vmemAuthTokenLength: (() => Promise<number>) | undefined;
}

export default defineBackground(() => {
  setConvexTokenRefresher(refreshConvexTokenFromClerk);

  registerAlarmListener();
  registerBookmarkListener();
  registerSyncHostCookieListener();
  registerWebClerkTokenHarvest();
  registerContextMenuClickListener();
  registerCommandListener();
  registerMessageHandler();

  // live e2e invokes the same path as Alt+S when OS shortcuts do not fire
  globalThis.__vmemHandleCommand = handleCommand;
  globalThis.__vmemSaveTab = savePageFromTab;
  globalThis.__vmemHarvestToken = harvestConvexTokenFromOpenVmemTabs;
  globalThis.__vmemListMemories = listMemories;
  globalThis.__vmemGetMemory = getMemory;
  globalThis.__vmemDeleteMemory = deleteMemory;
  globalThis.__vmemAuthTokenLength = async () => (await getAuthToken()).length;

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
