import { createMemory } from "./api-client";

export function registerContextMenu(): void {
  chrome.contextMenus.create({
    id: "save-to-vmem",
    title: "Save page to vmem",
    contexts: ["page"],
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "save-to-vmem") return;
    if (!tab?.id || !tab.url) return;

    savePageFromTab(tab.id, tab.url, tab.title ?? "Untitled");
  });
}

export async function savePageFromTab(
  tabId: number,
  url: string,
  fallbackTitle: string,
): Promise<{ success: boolean; memoryId?: string; error?: string }> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageContent,
    });

    const extraction = results[0]?.result;
    if (!extraction) {
      throw new Error("Failed to extract page content");
    }

    const hostname = new URL(url).hostname;
    const result = await createMemory({
      title: extraction.title || fallbackTitle,
      content: truncate(extraction.content, 10000),
      type: "knowledge",
      source: "browser-extension",
      tags: [hostname],
      confidence: 1.0,
      url,
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

function extractPageContent(): { title: string; content: string } {
  try {
    const doc = document.cloneNode(true) as Document;
    // @ts-expect-error Readability injected separately if available
    if (typeof Readability !== "undefined") {
      // @ts-expect-error Readability injected separately
      const article = new Readability(doc).parse();
      if (article) {
        return { title: article.title, content: article.textContent };
      }
    }
  } catch {
    // fallback below
  }

  return {
    title: document.title,
    content: document.body.innerText,
  };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n[truncated]";
}
