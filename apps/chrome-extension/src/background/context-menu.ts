import { truncate } from "es-toolkit/compat";
import { sendMessage } from "@/lib/messaging";
import { errorMessage } from "@/lib/error";
import { createMemory } from "./api-client";
import { htmlToMarkdown } from "@/lib/page-extraction";
import { extractPageFromTab } from "@/lib/extract-page";

// idempotent menu registration across install and startup
export function registerContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-to-vmem",
      title: "Save page to vmem",
      contexts: ["page"],
    });

    chrome.contextMenus.create({
      id: "screenshot-to-vmem",
      title: "Screenshot region to vmem",
      contexts: ["all"],
    });
  });
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): Promise<void> {
  console.log("[vmem] Context menu clicked:", info.menuItemId);
  if (!tab) return;

  if (info.menuItemId === "save-to-vmem") {
    void savePageFromTab(tab);
    return;
  }

  if (info.menuItemId === "screenshot-to-vmem") {
    if (typeof tab.id !== "number") return;
    void sendMessage("startScreenshot", undefined, tab.id).catch(
      (err: unknown) => {
        console.warn(
          "[vmem] Could not start screenshot on tab:",
          errorMessage(err),
        );
      },
    );
  }
}

export function registerContextMenuClickListener(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(info, tab);
  });
}

export async function savePageFromTab(
  tab: chrome.tabs.Tab,
): Promise<{ success: boolean; memoryId?: string; error?: string }> {
  if (!tab.id || !tab.url) {
    return { success: false, error: "Invalid tab" };
  }

  try {
    const extraction = await extractPageFromTab(tab.id);
    if (!extraction) {
      throw new Error("Failed to extract page content");
    }

    // turndown runs in the extension context, not the content-script
    const markdown = extraction.html
      ? htmlToMarkdown(extraction.html)
      : extraction.content;

    const hostname = new URL(tab.url).hostname;
    const memory = await createMemory({
      title: extraction.ogTitle ?? extraction.title ?? tab.title ?? "Untitled",
      content: truncate(markdown || extraction.content, {
        length: 10000,
        omission: "\n\n[truncated]",
      }),
      type: "knowledge",
      source: "browser-extension",
      tags: [hostname],
      confidence: 1.0,
      url: tab.url,
    });

    return { success: true, memoryId: memory.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
