// AI-generated (Claude), prompt: "characterization tests for global vs local relates to edge parse"
// Modified by me: stripped score on global merge and deduped bidirectional edges
import { describe, expect, it } from "vitest";
import {
  mergeGlobalRelatesToEdges,
  parseRelatesToEdgeRow,
} from "../../engine/neo4j/memory/graph";

describe("characterization: global graph edges omit score", () => {
  it("mergeGlobalRelatesToEdges strips score while local parse keeps it", () => {
    const raw = [
      { source: "a", target: "b", reason: "semantic similarity", score: 0.91 },
    ];

    expect(mergeGlobalRelatesToEdges(raw, [])).toEqual([
      { source: "a", target: "b", reason: "semantic similarity" },
    ]);

    expect(parseRelatesToEdgeRow(raw[0])).toEqual({
      source: "a",
      target: "b",
      reason: "semantic similarity",
      score: 0.91,
    });
  });

  it("deduplicates bidirectional global edge collection", () => {
    const out = [{ source: "a", target: "b", reason: "same session" }];
    const inbound = [
      { source: "a", target: "b", reason: "same session", score: 0.5 },
    ];

    expect(mergeGlobalRelatesToEdges(out, inbound)).toHaveLength(1);
  });
});
