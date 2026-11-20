export interface ComputeHighlightPointsInput {
  hoveredPointIndex?: number;
  neighborIndices?: readonly number[];
  hoveredLinkEndpoints?: {
    sourceIndex: number;
    targetIndex: number;
    linkIndex: number;
  } | null;
  // node with the open detail panel; hover wins over it, it wins over search
  selectedPointIndex?: number;
  selectedNeighborIndices?: readonly number[];
  isSearchActive: boolean;
  searchMatchIndices?: readonly number[];
}

export interface HighlightPointsResult {
  highlightedPointIndices: number[] | undefined;
  focusedLinkIndex: number | undefined;
}

function intersectWithSearch(
  indices: number[],
  searchMatchIndices: readonly number[] | undefined,
  isSearchActive: boolean,
): number[] {
  if (!isSearchActive || searchMatchIndices === undefined) return indices;
  const matchSet = new Set(searchMatchIndices);
  return indices.filter((idx) => matchSet.has(idx));
}

// pure highlight state for cosmos.gl focus/greyout parity with legacy canvas
export function computeHighlightPoints(
  input: ComputeHighlightPointsInput,
): HighlightPointsResult {
  const {
    hoveredPointIndex,
    neighborIndices,
    hoveredLinkEndpoints,
    selectedPointIndex,
    selectedNeighborIndices,
    isSearchActive,
    searchMatchIndices,
  } = input;

  if (hoveredLinkEndpoints !== undefined && hoveredLinkEndpoints !== null) {
    const highlightedPointIndices = intersectWithSearch(
      [hoveredLinkEndpoints.sourceIndex, hoveredLinkEndpoints.targetIndex],
      searchMatchIndices,
      isSearchActive,
    );
    return {
      highlightedPointIndices:
        highlightedPointIndices.length > 0
          ? highlightedPointIndices
          : undefined,
      focusedLinkIndex: hoveredLinkEndpoints.linkIndex,
    };
  }

  if (hoveredPointIndex !== undefined) {
    const hoverSet = new Set<number>([hoveredPointIndex]);
    if (neighborIndices !== undefined) {
      for (const n of neighborIndices) hoverSet.add(n);
    }
    const highlightedPointIndices = intersectWithSearch(
      [...hoverSet],
      searchMatchIndices,
      isSearchActive,
    );
    return {
      highlightedPointIndices:
        highlightedPointIndices.length > 0
          ? highlightedPointIndices
          : undefined,
      focusedLinkIndex: undefined,
    };
  }

  if (selectedPointIndex !== undefined) {
    const selectedSet = new Set<number>([selectedPointIndex]);
    if (selectedNeighborIndices !== undefined) {
      for (const n of selectedNeighborIndices) selectedSet.add(n);
    }
    return {
      highlightedPointIndices: [...selectedSet],
      focusedLinkIndex: undefined,
    };
  }

  if (isSearchActive && searchMatchIndices !== undefined) {
    return {
      highlightedPointIndices:
        searchMatchIndices.length > 0 ? [...searchMatchIndices] : undefined,
      focusedLinkIndex: undefined,
    };
  }

  return {
    highlightedPointIndices: undefined,
    focusedLinkIndex: undefined,
  };
}
