import {
  registerContextMenu,
  registerContextMenuClickListener,
  savePageFromTab,
} from "./context-menu";
import { registerMessageHandler } from "./message-handler";
import {
  startAutoSync,
  stopAutoSync,
  registerAlarmListener,
  registerBookmarkListener,
  bootstrapSyncSchedulers,
  catchUpHistorySyncIfOverdue,
} from "./sync-scheduler";
import { refreshUserSettingsMirrorFromConvex } from "./user-settings-mirror";
import { getStorage } from "@/lib/storage";

/**
 * Send the START_SCREENSHOT signal to the content script in a tab.
 * The screenshot content script is registered for `<all_urls>` so it
 * should already be present after `document_idle`. If it isn't (e.g. an
 * internal chrome:// page or a freshly-loaded tab), the message will
 * fail silently — that's fine; capture isn't supported on those pages
 * anyway.
 */
async function triggerScreenshot(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "START_SCREENSHOT" });
  } catch (err) {
    console.warn("[vmem] Could not start screenshot on tab:", err);
  }
}

// Handle keyboard shortcut commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "take-screenshot") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return;
    await triggerScreenshot(tab.id);
    return;
  }

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
          // Ensure Instrument Sans is loaded on the host page so the toast
          // matches the rest of the extension's typography. Idempotent.
          if (!document.getElementById("vmem-instrument-sans-font")) {
            const link = document.createElement("link");
            link.id = "vmem-instrument-sans-font";
            link.rel = "stylesheet";
            link.href =
              "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap";
            document.head.appendChild(link);
          }
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
            fontFamily:
              "'Instrument Sans', system-ui, -apple-system, sans-serif",
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
            if (!document.getElementById("vmem-instrument-sans-font")) {
              const link = document.createElement("link");
              link.id = "vmem-instrument-sans-font";
              link.rel = "stylesheet";
              link.href =
                "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap";
              document.head.appendChild(link);
            }
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
              fontFamily:
                "'Instrument Sans', system-ui, -apple-system, sans-serif",
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

// Same rule for context-menu clicks — Chrome wakes the SW on click but
// only delivers the event if the listener was wired during the
// synchronous SW startup pass. Wiring it inside onInstalled/onStartup is
// not enough because those don't fire on every wake-up.
registerContextMenuClickListener();

// Same rule again for bookmark events — bookmarks fire any time the user
// adds one, including when the SW has been dormant. Listener must be
// synchronously wired so Chrome can revive the SW with the event. The
// handler itself checks the autoSyncEnabled flag at call time.
registerBookmarkListener();

void bootstrapSyncSchedulers();

chrome.runtime.onInstalled.addListener(async (details) => {
  // Open welcome page on first install
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }

  registerContextMenu();
  await refreshUserSettingsMirrorFromConvex();
  await bootstrapSyncSchedulers();
  void catchUpHistorySyncIfOverdue();
});

chrome.runtime.onStartup.addListener(async () => {
  // Re-register on every browser start. Safe due to removeAll inside
  // registerContextMenu — without this, users who installed the extension
  // before a context-menu addition wouldn't see the new entry until the
  // next install/update event.
  registerContextMenu();
  await refreshUserSettingsMirrorFromConvex();
  await bootstrapSyncSchedulers();
  // Trigger an immediate sync if the alarm hasn't fired recently. The
  // 30-min periodic alarm survives browser restart, but if the user
  // restarts more often than that, they could go a long time between
  // syncs — this fills the gap.
  void catchUpHistorySyncIfOverdue();
});

// React to user toggling auto-sync in the popup.
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

registerMessageHandler();
