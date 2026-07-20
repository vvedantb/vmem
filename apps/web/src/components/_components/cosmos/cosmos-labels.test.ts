import { describe, expect, it } from "vitest";
import type { GraphEdgeType } from "@/lib/graph/types";
import {
  COSMOS_EDGE_LABEL,
  shouldShowCosmosLabel,
  shouldSkipCosmosLabels,
  truncateCosmosLabel,
} from "./cosmos-labels";

describe("truncateCosmosLabel", () => {
  it("truncates long titles", () => {
    const long = "a".repeat(40);
    expect(truncateCosmosLabel(long)).toHaveLength(26);
    expect(truncateCosmosLabel(long).endsWith("…")).toBe(true);
    expect(truncateCosmosLabel("short")).toBe("short");
  });
});

describe("shouldSkipCosmosLabels", () => {
  it("skips at low zoom, high node count, or when toggled off", () => {
    expect(shouldSkipCosmosLabels(false, 1, 100)).toBe(true);
    expect(shouldSkipCosmosLabels(true, 0.3, 100)).toBe(true);
    expect(shouldSkipCosmosLabels(true, 1, 6000)).toBe(true);
    expect(shouldSkipCosmosLabels(true, 1, 100)).toBe(false);
  });
});

describe("shouldShowCosmosLabel", () => {
  it("always shows hovered labels", () => {
    expect(
      shouldShowCosmosLabel({
        screenRadius: 1,
        isHovered: true,
        isNeighbor: false,
        hasHover: true,
      }),
    ).toBe(true);
  });

  it("shows neighbors above half the minimum radius", () => {
    expect(
      shouldShowCosmosLabel({
        screenRadius: 4,
        isHovered: false,
        isNeighbor: true,
        hasHover: true,
      }),
    ).toBe(true);
  });
});

describe("COSMOS_EDGE_LABEL", () => {
  it("covers every GraphEdgeType", () => {
    const edgeTypes: GraphEdgeType[] = [
      "tag",
      "relates_to",
      "imports",
      "calls",
      "wiki_parent",
      "contains",
      "has_method",
      "extends",
      "implements",
      "mentions",
      "starts_process",
      "includes",
    ];
    for (const edgeType of edgeTypes) {
      expect(COSMOS_EDGE_LABEL[edgeType].length).toBeGreaterThan(0);
    }
  });
});
