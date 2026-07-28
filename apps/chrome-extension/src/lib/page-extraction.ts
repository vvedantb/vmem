import TurndownService from "turndown";

// html to markdown via turndown in extension context, not page content-scripts
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
