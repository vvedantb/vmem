import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { getViewTheme } from "../graph-view-themes";
import { buildCosmosGraphBuffers, searchMatchIndices } from "./cosmos-adapters";
import { colorToRgba } from "./cosmos-color";

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    title: id,
    tags: ["alpha"],
    createdAt: "2026-01-01T00:00:00.000Z",
    size: 4,
    kind: "memory",
    sourceType: null,
    ...overrides,
  };
}

describe("colorToRgba", () => {
  it("parses hex and rgba", () => {
    expect(colorToRgba("#ff0000")).toEqual([1, 0, 0, 1]);
    expect(colorToRgba("#0f0")).toEqual([0, 1, 0, 1]);
    expect(colorToRgba("rgba(255, 128, 0, 0.5)")).toEqual([
      1,
      128 / 255,
      0,
      0.5,
    ]);
  });
});

describe("buildCosmosGraphBuffers", () => {
  it("builds index maps and link arrays", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const edges: GraphEdge[] = [
      {
        source: "a",
        target: "b",
        edgeType: "relates_to",
        weight: 1,
        reason: "similar",
        score: 0.9,
      },
      {
        source: "b",
        target: "missing",
        edgeType: "tag",
        weight: 1,
      },
    ];

    const buffers = buildCosmosGraphBuffers(nodes, edges, getViewTheme(true));

    expect(buffers.idToIndex.get("a")).toBe(0);
    expect(buffers.idToIndex.get("b")).toBe(1);
    expect(buffers.indexToId).toEqual(["a", "b", "c"]);
    expect(buffers.positions.length).toBe(6);
    expect(buffers.colors.length).toBe(12);
    expect(buffers.sizes.length).toBe(3);
    expect(buffers.links.length).toBe(2);
    expect(buffers.links[0]).toBe(0);
    expect(buffers.links[1]).toBe(1);
    expect(buffers.edgeMeta).toHaveLength(1);
    expect(buffers.edgeMeta[0]?.edgeType).toBe("relates_to");
    expect(buffers.edgeMeta[0]?.reason).toBe("similar");
  });

  it("collects search match indices", () => {
    expect(searchMatchIndices(["a", "b", "c"], new Set(["c", "a"]))).toEqual([
      0, 2,
    ]);
  });
});
