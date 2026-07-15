import { describe, expect, it } from "vitest";
import { shouldReplaceMentionEdges } from "../../engine/neo4j/memory/enrichment";

describe("characterization: empty enrichment entities preserve mentions", () => {
  it("shouldReplaceMentionEdges is false when entities array is empty", () => {
    expect(shouldReplaceMentionEdges([])).toBe(false);
  });

  it("shouldReplaceMentionEdges is true when entities are provided", () => {
    expect(
      shouldReplaceMentionEdges([
        { name: "Neo4j", normalizedName: "neo4j", type: "technology" },
      ]),
    ).toBe(true);
  });
});
