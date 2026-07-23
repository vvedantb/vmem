import { describe, expect, it } from "vitest";
import { computeHighlightPoints } from "./cosmos-highlight";

describe("computeHighlightPoints", () => {
  it("highlights hovered node and neighbors", () => {
    const result = computeHighlightPoints({
      hoveredPointIndex: 2,
      neighborIndices: [1, 3],
      isSearchActive: false,
    });
    expect(result.highlightedPointIndices).toEqual([2, 1, 3]);
    expect(result.focusedLinkIndex).toBeUndefined();
  });

  it("highlights edge endpoints and sets focused link", () => {
    const result = computeHighlightPoints({
      hoveredLinkEndpoints: { sourceIndex: 0, targetIndex: 4, linkIndex: 7 },
      isSearchActive: false,
    });
    expect(result.highlightedPointIndices).toEqual([0, 4]);
    expect(result.focusedLinkIndex).toBe(7);
  });

  it("intersects hover neighborhood with search matches", () => {
    const result = computeHighlightPoints({
      hoveredPointIndex: 2,
      neighborIndices: [1, 3, 5],
      isSearchActive: true,
      searchMatchIndices: [2, 5, 9],
    });
    expect(result.highlightedPointIndices).toEqual([2, 5]);
    expect(result.focusedLinkIndex).toBeUndefined();
  });

  it("returns search matches when only search is active", () => {
    const result = computeHighlightPoints({
      isSearchActive: true,
      searchMatchIndices: [0, 4],
    });
    expect(result.highlightedPointIndices).toEqual([0, 4]);
    expect(result.focusedLinkIndex).toBeUndefined();
  });

  it("returns undefined highlights when idle", () => {
    const result = computeHighlightPoints({ isSearchActive: false });
    expect(result.highlightedPointIndices).toBeUndefined();
    expect(result.focusedLinkIndex).toBeUndefined();
  });
});
