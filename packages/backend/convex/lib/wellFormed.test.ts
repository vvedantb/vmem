import { describe, expect, it } from "vitest";
import { toWellFormed, truncateWellFormed } from "./wellFormed";

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

describe("toWellFormed", () => {
  it("keeps valid text and pairs", () => {
    expect(toWellFormed(`a${EMOJI}b`)).toBe(`a${EMOJI}b`);
  });

  it("replaces lone high and low surrogates", () => {
    expect(toWellFormed("a\uD83Db")).toBe("a�b");
    expect(toWellFormed("a\uDE00b")).toBe("a�b");
    expect(toWellFormed("\uDE00\uD83D")).toBe("��");
  });
});

describe("truncateWellFormed", () => {
  it("returns short text unchanged", () => {
    expect(truncateWellFormed("abc", 5)).toBe("abc");
  });

  it("cuts to max code units", () => {
    expect(truncateWellFormed("abcdef", 3)).toBe("abc");
  });

  it("drops a pair that straddles the cut", () => {
    expect(truncateWellFormed(`ab${EMOJI}c`, 3)).toBe("ab");
  });

  it("keeps a pair that ends at the cut", () => {
    expect(truncateWellFormed(`ab${EMOJI}c`, 4)).toBe(`ab${EMOJI}`);
  });

  it("replaces a pre-existing lone surrogate", () => {
    const out = truncateWellFormed("a\uDE00bc", 3);
    expect(out).toBe("a�b");
    expect(isWellFormed(out)).toBe(true);
  });

  it("handles zero and negative max", () => {
    expect(truncateWellFormed(EMOJI, 0)).toBe("");
    expect(truncateWellFormed(EMOJI, -1)).toBe("");
  });
});
