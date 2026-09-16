import { describe, expect, it } from "vitest";
import { generateBenchGraph } from "./bench-data";

describe("client graph ?bench=n synthetic graph", () => {
  it("builds a deterministic graph without Convex", () => {
    const a = generateBenchGraph(25);
    const b = generateBenchGraph(25);
    expect(a.nodes).toHaveLength(25);
    expect(a.nodes.map((node) => node.id)).toEqual(
      b.nodes.map((node) => node.id),
    );
    expect(a.relatesToEdges.length).toBeGreaterThan(0);
    expect(a.nodes[0]?.source).toBe("bench");
    expect(a.nodes.every((node) => node.kind === "memory")).toBe(true);
  });

  it("clamps invalid counts to at least one node", () => {
    expect(generateBenchGraph(0).nodes).toHaveLength(1);
    expect(generateBenchGraph(12).nodes).toHaveLength(12);
  });
});
