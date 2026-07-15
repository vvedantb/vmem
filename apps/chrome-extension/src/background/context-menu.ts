import { createMemory } from "./api-client";
import { htmlToMarkdown } from "@/lib/page-extraction";
import { extractPageFromTab } from "@/lib/extract-page";

// recreate context menus (idempotent across install/startup)
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
      // viewport capture show on any click target
      contexts: ["all"],
    });
  });
}

// click handler register via registerContextMenuClickListener at sw top level
export async function handleContextMenuClick(
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
    void chrome.tabs
      .sendMessage(tab.id, { type: "START_SCREENSHOT" })
      .catch((err: unknown) => {
        console.warn("[vmem] Could not start screenshot on tab:", err);
      });
  }
}

// register click listener synchronously at sw top level
export function registerContextMenuClickListener(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(info, tab);
  });
}

// save active tab page (context menu / keyboard shortcut)
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

    // turndown runs in the extension context, not the content script
    const markdown = extraction.html
      ? htmlToMarkdown(extraction.html)
      : extraction.content;

    const hostname = new URL(tab.url).hostname;
    const memory = await createMemory({
      title: extraction.ogTitle ?? extraction.title ?? tab.title ?? "Untitled",
      content: truncate(markdown || extraction.content, 10000),
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

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n[truncated]";
}
