import TurndownService from "turndown";

// html → markdown via turndown (runs in extension/background not page cs)
export function htmlToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // drop empty links
  turndownService.addRule("removeEmptyLinks", {
    filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
    replacement: () => "",
  });

  // limit markdown length
  const markdown = turndownService.turndown(html);
  return markdown.slice(0, 50000);
}
