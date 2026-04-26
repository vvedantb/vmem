import { createMemory } from "./api-client";
import { htmlToMarkdown } from "@/lib/page-extraction";
import { extractPageFromTab } from "@/lib/extract-page";

export function registerContextMenu(): void {
  chrome.contextMenus.create({
    id: "save-to-vmem",
    title: "Save page to vmem",
    contexts: ["page"],
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "save-to-vmem") return;
    if (!tab) return;

    void savePageFromTab(tab);
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
