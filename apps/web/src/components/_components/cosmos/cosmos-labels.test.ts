import { describe, expect, it } from "vitest";
import type { GraphEdgeType } from "@/lib/graph/types";
import {
  COSMOS_EDGE_LABEL,
  COSMOS_LABEL_RANK,
  placeCosmosLabels,
  shouldSkipCosmosLabels,
  truncateCosmosLabel,
  type CosmosLabelCandidate,
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

describe("placeCosmosLabels", () => {
  const base = { importance: 1, y: 0 };
  const place = (candidates: CosmosLabelCandidate[], maxLabels = 10) =>
    placeCosmosLabels({
      candidates,
      maxLabels,
      height: 12,
      padding: 2,
      measureWidth: () => 40,
    }).map((label) => label.index);

  it("drops a label that overlaps a more important label", () => {
    expect(
      place([
        { ...base, index: 0, rank: COSMOS_LABEL_RANK.ambient, x: 100 },
        {
          ...base,
          index: 1,
          rank: COSMOS_LABEL_RANK.ambient,
          x: 110,
          importance: 5,
        },
        { ...base, index: 2, rank: COSMOS_LABEL_RANK.ambient, x: 300 },
      ]),
    ).toEqual([1, 2]);
  });

  it("gives the space to the lower rank", () => {
    expect(
      place([
        {
          ...base,
          index: 0,
          rank: COSMOS_LABEL_RANK.ambient,
          x: 100,
          importance: 9,
        },
        { ...base, index: 1, rank: COSMOS_LABEL_RANK.searchMatch, x: 300 },
        { ...base, index: 2, rank: COSMOS_LABEL_RANK.anchor, x: 100 },
      ]),
    ).toEqual([2, 1]);
  });

  it("stops at the label limit", () => {
    expect(
      place(
        [0, 1, 2].map((index) => ({
          ...base,
          index,
          rank: COSMOS_LABEL_RANK.ambient,
          x: index * 200,
        })),
        2,
      ),
    ).toHaveLength(2);
  });
});

describe("COSMOS_EDGE_LABEL", () => {
  it("covers every GraphEdgeType", () => {
    const edgeTypes: GraphEdgeType[] = ["tag", "relates_to", "mentions"];
    for (const edgeType of edgeTypes) {
      expect(COSMOS_EDGE_LABEL[edgeType].length).toBeGreaterThan(0);
    }
  });
});
