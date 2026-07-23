import type { GraphEdgeType } from "@/lib/graph/types";

const LABEL_MAX_CHARS = 26;
export const COSMOS_LOW_ZOOM_THRESHOLD = 0.4;
export const COSMOS_HIGH_NODE_COUNT = 5000;
const MIN_LABEL_SCREEN_R = 6;

/** Edge-type pill labels. */
export const COSMOS_EDGE_LABEL: Record<GraphEdgeType, string> = {
  tag: "tagged",
  relates_to: "relates to",
  imports: "imports",
  calls: "calls",
  wiki_parent: "parent of",
  contains: "contains",
  has_method: "has method",
  extends: "extends",
  implements: "implements",
  mentions: "mentions",
  starts_process: "starts process",
  includes: "includes",
};

export function truncateCosmosLabel(title: string): string {
  if (title.length <= LABEL_MAX_CHARS) return title;
  return title.slice(0, LABEL_MAX_CHARS - 1) + "…";
}

export function shouldSkipCosmosLabels(
  showLabels: boolean,
  zoomLevel: number,
  nodeCount: number,
): boolean {
  return (
    !showLabels ||
    zoomLevel < COSMOS_LOW_ZOOM_THRESHOLD ||
    nodeCount > COSMOS_HIGH_NODE_COUNT
  );
}

/** Label thinning gates for dense graphs. */
export function shouldShowCosmosLabel(opts: {
  screenRadius: number;
  isHovered: boolean;
  isNeighbor: boolean;
  hasHover: boolean;
}): boolean {
  if (opts.isHovered) return true;
  const bigEnough = opts.screenRadius >= MIN_LABEL_SCREEN_R;
  const neighborBigEnough = opts.screenRadius >= MIN_LABEL_SCREEN_R / 2;
  if (opts.isNeighbor && neighborBigEnough) return true;
  return !opts.hasHover && bigEnough;
}
