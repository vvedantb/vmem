import { sendMessage } from "@/lib/messaging";
import { errorMessage } from "@/lib/error";
import { savePageFromTab } from "./context-menu";
import { injectPageToast } from "./inject-page-toast";
import { toastForSaveResult } from "./save-toast";

async function triggerScreenshot(tabId: number): Promise<void> {
  try {
    await sendMessage("startScreenshot", undefined, tabId);
  } catch (err) {
    console.warn(
      "[vmem] Could not start screenshot on tab:",
      errorMessage(err),
    );
  }
}

// x and youtube save their own item; no answer means no site script on this tab
async function triggerSiteSave(tabId: number): Promise<boolean> {
  try {
    const { handled } = await sendMessage("siteSave", undefined, tabId);
    return handled;
  } catch {
    return false;
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
    if (await triggerSiteSave(tabId)) return;

    try {
      const result = await savePageFromTab(tab);
      const toast = toastForSaveResult(result);
      await injectPageToast(tabId, toast.message, toast.color);
    } catch (err) {
      console.error("[vmem] Keyboard shortcut save failed:", err);
      try {
        await injectPageToast(tabId, "✗ Failed to save page", "#f87171");
      } catch {
        // tab may have navigated before toast injection
      }
    }
  }
}
