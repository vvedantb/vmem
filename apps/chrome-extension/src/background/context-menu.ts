import { createMemory } from "./api-client";
import { htmlToMarkdown } from "@/lib/page-extraction";

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
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent,
    });

    const extraction = results[0]?.result;
    if (!extraction) {
      throw new Error("Failed to extract page content");
    }

    // Convert HTML to markdown in the extension context
    const markdown = htmlToMarkdown(extraction.html);

    const hostname = new URL(tab.url).hostname;
    const result = await createMemory({
      title: extraction.ogTitle || extraction.title || tab.title || "Untitled",
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

interface PageExtraction {
  title: string;
  ogTitle?: string;
  content: string;
  html: string;
  ogImage?: string;
  ogDescription?: string;
}

function extractPageContent(): PageExtraction {
  // Get OG metadata
  const ogImage =
    document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content") ||
    document.querySelector('meta[name="og:image"]')?.getAttribute("content") ||
    undefined;

  const ogTitle =
    document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content") ||
    document.querySelector('meta[name="og:title"]')?.getAttribute("content") ||
    undefined;

  const ogDescription =
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content") ||
    document
      .querySelector('meta[name="og:description"]')
      ?.getAttribute("content") ||
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ||
    undefined;

  // Clone body and strip non-content elements
  const bodyClone = document.body.cloneNode(true) as HTMLElement;

  const removeSelectors = [
    "script",
    "style",
    "noscript",
    "iframe",
    "nav",
    "footer",
    "header",
    "aside",
    "[role='banner']",
    "[role='navigation']",
    "[role='complementary']",
    "[role='contentinfo']",
    ".ad",
    ".ads",
    ".advertisement",
    "[data-ad]",
  ];

  removeSelectors.forEach((selector) => {
    bodyClone.querySelectorAll(selector).forEach((el) => el.remove());
  });

  return {
    title: document.title,
    ogTitle,
    content: bodyClone.innerText.trim().slice(0, 50000),
    html: bodyClone.innerHTML,
    ogImage,
    ogDescription,
  };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n[truncated]";
}
