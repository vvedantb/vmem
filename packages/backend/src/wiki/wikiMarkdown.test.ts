import { describe, expect, it } from "vitest";
import {
  markdownToWikiStorage,
  mergeMarkdownForAppend,
  wikiDocToMarkdown,
  wikiStorageToMarkdown,
} from "./wikiMarkdown";

describe("wikiMarkdown", () => {
  it("round-trips headings and paragraphs", () => {
    const md = "# Title\n\nHello world.";
    const stored = markdownToWikiStorage(md);
    expect(wikiStorageToMarkdown(stored.contentJson, stored.contentText)).toBe(
      md,
    );
  });

  it("appends with a blank line separator", () => {
    expect(mergeMarkdownForAppend("Line one", "Line two")).toBe(
      "Line one\n\nLine two",
    );
  });

  it("parses bullet lists", () => {
    const md = "- first\n- second";
    const doc = JSON.parse(markdownToWikiStorage(md).contentJson);
    expect(doc.content[0].type).toBe("bulletList");
    expect(wikiDocToMarkdown(doc)).toBe(md);
  });
});
