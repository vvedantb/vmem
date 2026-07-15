// AI-generated (Claude), prompt: "test markdown to plain text and append merge for wiki content"
// Modified by me: stripped images strikethrough and joined with blank line
import { describe, expect, it } from "vitest";
import {
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
});
