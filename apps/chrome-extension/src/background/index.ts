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

// Handle keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "save-page") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id || !tab.url) return;

    console.log("[vmem] Keyboard shortcut: saving page", tab.url);
    const tabId = tab.id;

    try {
      await savePageFromTab(tab);
      // Show success toast in the active tab
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const el = document.createElement("div");
          Object.assign(el.style, {
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: "rgba(24,24,28,0.95)",
            backdropFilter: "blur(16px)",
            color: "#4ade80",
            padding: "10px 18px",
            borderRadius: "10px",
            fontFamily: "system-ui, sans-serif",
            fontSize: "13px",
            fontWeight: "500",
            zIndex: "2147483647",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            opacity: "0",
            transform: "translateY(8px)",
            transition: "opacity 200ms ease, transform 200ms ease",
          });
          el.textContent = "✓ Page saved to vmem";
          document.documentElement.appendChild(el);
          requestAnimationFrame(() => {
            el.style.opacity = "1";
            el.style.transform = "translateY(0)";
          });
          setTimeout(() => {
            el.style.opacity = "0";
            el.style.transform = "translateY(8px)";
            setTimeout(() => el.remove(), 200);
          }, 2500);
        },
      });
    } catch (err) {
      console.error("[vmem] Keyboard shortcut save failed:", err);
      // Show error toast
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const el = document.createElement("div");
            Object.assign(el.style, {
              position: "fixed",
              bottom: "24px",
              right: "24px",
              background: "rgba(24,24,28,0.95)",
              backdropFilter: "blur(16px)",
              color: "#f87171",
              padding: "10px 18px",
              borderRadius: "10px",
              fontFamily: "system-ui, sans-serif",
              fontSize: "13px",
              fontWeight: "500",
              zIndex: "2147483647",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              opacity: "0",
              transform: "translateY(8px)",
              transition: "opacity 200ms ease, transform 200ms ease",
            });
            el.textContent = "✗ Failed to save page";
            document.documentElement.appendChild(el);
            requestAnimationFrame(() => {
              el.style.opacity = "1";
              el.style.transform = "translateY(0)";
            });
            setTimeout(() => {
              el.style.opacity = "0";
              el.style.transform = "translateY(8px)";
              setTimeout(() => el.remove(), 200);
            }, 2500);
          },
        });
      } catch {
        // Tab may have navigated away — ignore
      }
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
});

chrome.runtime.onStartup.addListener(async () => {
  await refreshUserSettingsMirrorFromConvex();
  ensureSettingsMirrorAlarm();
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
