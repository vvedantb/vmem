import { describe, expect, it } from "vitest";
import { MEMORY_PREVIEW_CHARS, memoryPreview } from "./mappers";

const EMOJI = "😀"; // U+1F600, two code units

// encodeURIComponent throws URIError on a lone surrogate
function isWellFormed(text: string): boolean {
  try {
    encodeURIComponent(text);
    return true;
  } catch {
    return false;
  }
}

describe("memoryPreview", () => {
  it("drops an emoji that straddles the preview boundary", () => {
    const content = `${"a".repeat(MEMORY_PREVIEW_CHARS - 1)}${EMOJI}tail`;
    const preview = memoryPreview(content);
    expect(preview).toBe("a".repeat(MEMORY_PREVIEW_CHARS - 1));
    expect(isWellFormed(preview)).toBe(true);
  });

  it("drops an emoji that straddles the raw pre-cut", () => {
    const content = `${"a".repeat(MEMORY_PREVIEW_CHARS * 2 - 1)}${EMOJI}`;
    expect(isWellFormed(memoryPreview(content))).toBe(true);
  });

  it("keeps an emoji that ends at the boundary", () => {
    const content = `${"a".repeat(MEMORY_PREVIEW_CHARS - 2)}${EMOJI}tail`;
    const preview = memoryPreview(content);
    expect(preview).toHaveLength(MEMORY_PREVIEW_CHARS);
    expect(preview.endsWith(EMOJI)).toBe(true);
  });

  it("replaces a pre-existing lone surrogate", () => {
    const preview = memoryPreview("broken \uD83D here");
    expect(preview).toBe("broken � here");
    expect(isWellFormed(preview)).toBe(true);
  });

  it("still collapses whitespace and trims", () => {
    expect(memoryPreview("  a\n\n b\t c  ")).toBe("a b c");
  });
});
