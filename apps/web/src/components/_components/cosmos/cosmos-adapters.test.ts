import { describe, expect, it } from "vitest";
import { cosmosPhysicsForNodeCount } from "@vmem/shared/graph";
import type { GraphEdge, GraphNode } from "@/lib/graph/types";
import { getViewTheme } from "../graph-view-themes";
import {
  buildCosmosGraphBuffers,
  capturePointPositions,
  COSMOS_POINT_SHAPE,
  cosmosPointShapeForKind,
  searchMatchIndices,
} from "./cosmos-adapters";
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
    expect(buffers.shapes.length).toBe(3);
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

  it("maps graph node kinds to Cosmos point shapes", () => {
    expect(cosmosPointShapeForKind("memory")).toBe(COSMOS_POINT_SHAPE.Circle);
    expect(cosmosPointShapeForKind("wiki-folder")).toBe(
      COSMOS_POINT_SHAPE.Square,
    );
    expect(cosmosPointShapeForKind("wiki-document")).toBe(
      COSMOS_POINT_SHAPE.Diamond,
    );
    expect(cosmosPointShapeForKind("skill")).toBe(COSMOS_POINT_SHAPE.Hexagon);
    expect(cosmosPointShapeForKind("entity")).toBe(COSMOS_POINT_SHAPE.Star);
    expect(cosmosPointShapeForKind("code-file")).toBe(
      COSMOS_POINT_SHAPE.Square,
    );
    expect(cosmosPointShapeForKind("code-class")).toBe(
      COSMOS_POINT_SHAPE.Hexagon,
    );
    expect(cosmosPointShapeForKind("code-interface")).toBe(
      COSMOS_POINT_SHAPE.Diamond,
    );
    expect(cosmosPointShapeForKind("code-process")).toBe(
      COSMOS_POINT_SHAPE.Star,
    );
  });

  it("seeds tiny graphs tightly instead of on the large overview ring", () => {
    const buffers = buildCosmosGraphBuffers(
      [node("a"), node("b")],
      [],
      getViewTheme(true),
    );
    const dx = (buffers.positions[0] ?? 0) - (buffers.positions[2] ?? 0);
    const dy = (buffers.positions[1] ?? 0) - (buffers.positions[3] ?? 0);
    expect(Math.hypot(dx, dy)).toBeLessThan(200);
  });

  it("assigns link widths and strengths per edge type", () => {
    const dark = getViewTheme(true);
    const light = getViewTheme(false);
    const edges: GraphEdge[] = [
      { source: "a", target: "b", edgeType: "tag", weight: 1 },
      { source: "a", target: "c", edgeType: "relates_to", weight: 1 },
    ];
    const darkBuffers = buildCosmosGraphBuffers(
      [node("a"), node("b"), node("c")],
      edges,
      dark,
    );
    const lightBuffers = buildCosmosGraphBuffers(
      [node("a"), node("b"), node("c")],
      edges,
      light,
    );

    expect(darkBuffers.linkWidths[0]).toBeCloseTo(dark.edge.width);
    expect(darkBuffers.linkWidths[1]).toBeCloseTo(dark.edge.width * 2);
    expect(lightBuffers.linkWidths[1]).toBeCloseTo(light.edge.width * 2);
    expect(darkBuffers.linkStrengths[0]).toBe(0);
    expect(darkBuffers.linkStrengths[1]).toBe(1);
  });

  it("prefers previous positions over ring seeding", () => {
    const ringBuffers = buildCosmosGraphBuffers(
      [node("a"), node("b")],
      [],
      getViewTheme(true),
    );
    const saved = new Map([
      ["a", { x: 100, y: 200 }],
      ["b", { x: 300, y: 400 }],
    ]);
    const persisted = buildCosmosGraphBuffers(
      [node("a"), node("b")],
      [],
      getViewTheme(true),
      4096,
      saved,
    );
    expect(persisted.positions[0]).toBe(100);
    expect(persisted.positions[1]).toBe(200);
    expect(persisted.positions[2]).toBe(300);
    expect(persisted.positions[3]).toBe(400);
    expect(persisted.positions[0]).not.toBe(ringBuffers.positions[0]);
  });

  it("captures point positions and guards mismatched lengths", () => {
    const buffers = buildCosmosGraphBuffers(
      [node("a"), node("b")],
      [],
      getViewTheme(true),
    );
    buffers.positions[0] = 11;
    buffers.positions[1] = 22;
    buffers.positions[2] = 33;
    buffers.positions[3] = 44;

    const captured = capturePointPositions(
      buffers.indexToId,
      buffers.positions,
    );
    expect(captured.get("a")).toEqual({ x: 11, y: 22 });
    expect(captured.get("b")).toEqual({ x: 33, y: 44 });

    const bad = capturePointPositions(buffers.indexToId, new Float32Array(3));
    expect(bad.size).toBe(0);
  });
});

describe("cosmosPhysicsForNodeCount", () => {
  it("returns a settling Cosmos config for mid-size graphs", () => {
    const p = cosmosPhysicsForNodeCount(500);
    expect(p.simulationRepulsion).toBe(1);
    expect(p.simulationGravity).toBeCloseTo(0.125);
    expect(p.simulationFriction).toBeLessThan(0.85);
    expect(p.simulationDecay).toBeLessThan(5000);
    expect(p.simulationRepulsionFromMouse).toBe(0);
    expect(p.simulationCollision).toBe(1);
  });

  it("keeps small local graphs tighter than overview graphs", () => {
    const small = cosmosPhysicsForNodeCount(5);
    const overview = cosmosPhysicsForNodeCount(500);
    expect(small.simulationRepulsion).toBeLessThan(
      overview.simulationRepulsion,
    );
    expect(small.simulationLinkDistance).toBeLessThan(
      overview.simulationLinkDistance,
    );
  });

  it("disables collision on very large graphs", () => {
    const p = cosmosPhysicsForNodeCount(20_000);
    expect(p.simulationCollision).toBe(0);
    expect(p.simulationDecay).toBeGreaterThan(1100);
  });
});
