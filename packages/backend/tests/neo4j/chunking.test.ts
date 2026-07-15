// AI-generated (Claude), prompt: "unit tests for memory text chunking threshold and overlap"
// Modified by me: checked overlapping offsets on long prose
import { describe, expect, it } from "vitest";
import { chunkText, shouldChunk } from "../../engine/neo4j/chunking";

describe("shouldChunk", () => {
  it("returns false for content at or below the chunking threshold", () => {
    expect(shouldChunk("")).toBe(false);
    expect(shouldChunk("x".repeat(2000))).toBe(false);
  });

  it("returns true for content above the chunking threshold", () => {
    expect(shouldChunk("x".repeat(2001))).toBe(true);
  });
});

describe("chunkText", () => {
  it("returns no chunks for empty content", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns a single chunk for short content", () => {
    const content = "Short memory body.";
    expect(chunkText(content)).toEqual([
      { content, startOffset: 0, endOffset: content.length },
    ]);
  });

  it("splits long prose into multiple overlapping chunks", () => {
    const paragraph = "The quick brown fox jumps over the lazy dog. ";
    const content = paragraph.repeat(120);
    const chunks = chunkText(content);

    expect(chunks.length).toBeGreaterThan(1);

    for (let i = 0; i < chunks.length - 1; i++) {
      const current = chunks[i];
      const next = chunks[i + 1];
      if (current === undefined || next === undefined) continue;
      expect(current.endOffset).toBeGreaterThan(next.startOffset);
      expect(next.startOffset).toBeLessThan(current.endOffset);
    }
  });

  it("spans the full source document from first offset to last", () => {
    const content = "segment ".repeat(500).trimEnd();
    const chunks = chunkText(content);

    expect(chunks[0]?.startOffset).toBe(0);
    expect(chunks[chunks.length - 1]?.endOffset).toBe(content.length);
  });
});
