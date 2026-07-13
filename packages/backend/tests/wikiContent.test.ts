import { describe, expect, it } from "vitest";
import {
  legacyJsonToMarkdown,
  markdownToPlainText,
  mergeMarkdownForAppend,
} from "../convex/lib/wikiContent";

describe("wikiContent", () => {
  it("derives plain text from markdown", () => {
    expect(markdownToPlainText("# Title\n\nHello **world**.")).toBe(
      "Title\nHello world.",
    );
  });

  it("strips images and strikethrough", () => {
    expect(
      markdownToPlainText("See ![alt](https://example.com/a.png) and ~~old~~"),
    ).toBe("See alt and old");
  });

  it("appends with a blank line separator", () => {
    expect(mergeMarkdownForAppend("Line one", "Line two")).toBe(
      "Line one\n\nLine two",
    );
  });

  it("converts legacy JSON headings to markdown", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body" }],
        },
      ],
    });
    expect(legacyJsonToMarkdown(json, "")).toBe("# Title\n\nBody");
  });
});
