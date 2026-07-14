import { savePageFromTab } from "./context-menu";
import { injectPageToast } from "./inject-page-toast";

async function triggerScreenshot(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "START_SCREENSHOT" });
  } catch (err) {
    console.warn("[vmem] Could not start screenshot on tab:", err);
  }
}

export function registerCommandListener(): void {
  chrome.commands.onCommand.addListener((command) => {
    void handleCommand(command);
  });
}

export async function handleCommand(command: string): Promise<void> {
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
      await injectPageToast(tabId, "✓ Page saved to vmem", "#4ade80");
    } catch (err) {
      console.error("[vmem] Keyboard shortcut save failed:", err);
      try {
        await injectPageToast(tabId, "✗ Failed to save page", "#f87171");
      } catch {
        // Tab may have navigated away
      }
    }
  }
}
