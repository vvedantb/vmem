// AI-generated (Claude), prompt: "unit tests for canvas spatial index hit testing on nodes and edges"
// Modified by me: added dirty rebuild skip case
import { describe, expect, it } from "vitest";
import type { GraphNode, ResolvedEdge } from "@/lib/graph/types";
import {
  createSpatialIndex,
  getEdgeAt,
  getNodeAt,
  markDirty,
  rebuildIndex,
} from "./hit-test";

function node(id: string, x: number, y: number, size = 10): GraphNode {
  return {
    id,
    title: id,
    tags: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    size,
    kind: "memory",
    sourceType: null,
    x,
    y,
  };
}

function edge(source: GraphNode, target: GraphNode): ResolvedEdge {
  return {
    source,
    target,
    edgeType: "relates_to",
    weight: 1,
  };
}

describe("spatial index", () => {
  it("skips rebuild when not dirty", () => {
    const index = createSpatialIndex();
    const nodes = [node("a", 0, 0)];
    rebuildIndex(index, nodes);

    nodes[0] = node("a", 500, 500);
    rebuildIndex(index, nodes);
    expect(getNodeAt(index, 500, 500, 1)).toBeNull();
    expect(getNodeAt(index, 0, 0, 1)?.id).toBe("a");
  });

  it("rebuilds when marked dirty after node moves", () => {
    const index = createSpatialIndex();
    const nodes = [node("a", 0, 0)];
    rebuildIndex(index, nodes);

    nodes[0] = node("a", 120, 0);
    markDirty(index);
    rebuildIndex(index, nodes);
    expect(getNodeAt(index, 120, 0, 1)?.id).toBe("a");
    expect(getNodeAt(index, 0, 0, 1)).toBeNull();
  });

  it("finds closest node within hit radius across cells", () => {
    const index = createSpatialIndex();
    const near = node("near", 5, 0);
    const far = node("far", 200, 0);
    rebuildIndex(index, [near, far]);
    expect(getNodeAt(index, 8, 0, 1)?.id).toBe("near");
  });

  it("prefers closer node when both are in range", () => {
    const index = createSpatialIndex();
    const a = node("a", 0, 0, 20);
    const b = node("b", 15, 0, 20);
    rebuildIndex(index, [a, b]);
    expect(getNodeAt(index, 10, 0, 1)?.id).toBe("b");
  });

  it("scales hit radius inversely with zoom", () => {
    const index = createSpatialIndex();
    const n = node("a", 0, 0, 10);
    rebuildIndex(index, [n]);
    expect(getNodeAt(index, 30, 0, 1)).toBeNull();
    expect(getNodeAt(index, 30, 0, 0.25)?.id).toBe("a");
  });
});

describe("getEdgeAt", () => {
  it("returns null when pointer is beyond threshold", () => {
    const a = node("a", 0, 0);
    const b = node("b", 100, 0);
    const edges = [edge(a, b)];
    expect(getEdgeAt(edges, 0, 20, 1)).toBeNull();
  });

  it("hits segment closest to pointer", () => {
    const a = node("a", 0, 0);
    const b = node("b", 100, 0);
    const edges = [edge(a, b)];
    expect(getEdgeAt(edges, 50, 2, 1)).toBe(0);
  });

  it("widens threshold when zoomed out", () => {
    const a = node("a", 0, 0);
    const b = node("b", 100, 0);
    const edges = [edge(a, b)];
    expect(getEdgeAt(edges, 50, 8, 0.5)).toBe(0);
    expect(getEdgeAt(edges, 50, 8, 1)).toBeNull();
  });

  it("returns first qualifying edge when distances tie", () => {
    const a = node("a", 0, 0);
    const b = node("b", 100, 0);
    const c = node("c", 0, 100);
    const edges = [edge(a, b), edge(a, c)];
    expect(getEdgeAt(edges, 2, 2, 1)).toBe(0);
  });
});
