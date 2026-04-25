import TurndownService from "turndown";

/**
 * Extracted page data with rich metadata
 */
export interface ExtractedPageData {
  title: string;
  content: string;
  markdown: string;
  url: string;
  ogImage?: string;
  ogDescription?: string;
  favicon?: string;
}

/**
 * Extract page content and metadata.
 * This function is designed to be injected into the page context via chrome.scripting.executeScript.
 */
export function extractPageData(): Omit<ExtractedPageData, "markdown"> & {
  html: string;
} {
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

  // Clone body and strip scripts/styles for cleaner HTML
  const bodyClone = document.body.cloneNode(true) as HTMLElement;

  // Remove non-content elements
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

  // Get clean HTML
  const html = bodyClone.innerHTML;

  // Get plain text for content field
  const content = bodyClone.innerText.trim().slice(0, 50000); // Limit to 50k chars

  // Get favicon
  const faviconLink =
    document.querySelector('link[rel="icon"]') ||
    document.querySelector('link[rel="shortcut icon"]');
  const favicon = faviconLink?.getAttribute("href") || undefined;

  return {
    title: ogTitle || document.title || "Untitled",
    content,
    html,
    url: window.location.href,
    ogImage,
    ogDescription,
    favicon,
  };
}

/**
 * Convert HTML to Markdown using Turndown.
 * Call this in the extension context (not injected script) since it requires the library.
 */
export function htmlToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // Remove empty links
  turndownService.addRule("removeEmptyLinks", {
    filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
    replacement: () => "",
  });

  // Limit markdown length
  const markdown = turndownService.turndown(html);
  return markdown.slice(0, 50000);
}
