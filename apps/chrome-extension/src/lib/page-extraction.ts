import TurndownService from "turndown";

/**
 * Convert HTML to Markdown using Turndown.
 *
 * Lives in the extension/background context (not in the page-injected
 * content script) because Turndown needs to be imported, and content
 * scripts have their own bundle. The Readability content script returns
 * raw article HTML; the background converts it to markdown before
 * persisting.
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
