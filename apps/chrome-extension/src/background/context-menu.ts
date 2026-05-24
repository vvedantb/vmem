import { createMemory } from "./api-client";
import { htmlToMarkdown } from "@/lib/page-extraction";
import { extractPageFromTab } from "@/lib/extract-page";

/**
 * Idempotently (re-)create the menu items themselves. Chrome auto-clears
 * context menus on extension reload, but we also call removeAll defensively
 * so calling this from both onInstalled and onStartup is safe.
 *
 * The click listener is registered separately at module top-level (see
 * `registerContextMenuClickListener`) — MV3 service workers wake on event
 * dispatch only if the matching listener was attached synchronously at SW
 * startup, so listeners can't live inside async event handlers.
 */
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
      // `["all"]` so the entry shows up regardless of what the user
      // right-clicked on (link, image, selection, etc.). Screenshots
      // operate on the visible viewport, so the click target doesn't
      // constrain the action.
      contexts: ["all"],
    });
  });
}

/**
 * Register the contextMenus click listener. MUST be called synchronously
 * at the top level of the service worker entry — otherwise an idle SW that
 * gets woken by a context-menu click will not have the listener attached
 * in time, and the click event is lost.
 */
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
      .catch((err) => {
        console.warn("[vmem] Could not start screenshot on tab:", err);
      });
  }
}

export function registerContextMenuClickListener(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(info, tab);
  });
}

/**
 * Save a page from a tab. Can be called from context menu or keyboard shortcut.
 */
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

    // Convert Readability-extracted HTML to markdown in the extension
    // context (Turndown lives here, not in the content script). When the
    // fallback path produced no HTML we fall back to the plain text.
    const markdown = extraction.html
      ? htmlToMarkdown(extraction.html)
      : extraction.content;

    const hostname = new URL(tab.url).hostname;
    const result = await createMemory({
      title: extraction.ogTitle ?? extraction.title ?? tab.title ?? "Untitled",
      content: truncate(markdown || extraction.content, 10000),
      type: "knowledge",
      source: "browser-extension",
      tags: [hostname],
      confidence: 1.0,
      url: tab.url,
    });

    if (result.status === "duplicate") {
      return { success: false, error: "Already saved" };
    }

    return { success: true, memoryId: result.memory.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n[truncated]";
}
