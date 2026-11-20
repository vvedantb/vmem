import { truncateCosmosLabel } from "@vmem/shared/graph";
import type { GraphEdgeType } from "@/lib/graph/types";

export { truncateCosmosLabel };

export const COSMOS_LOW_ZOOM_THRESHOLD = 0.4;
export const COSMOS_HIGH_NODE_COUNT = 5000;

// edge, type pill labels
export const COSMOS_EDGE_LABEL: Record<GraphEdgeType, string> = {
  tag: "tagged",
  relates_to: "relates to",
  mentions: "mentions",
};

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

// label draw order: a lower rank wins the space
export const COSMOS_LABEL_RANK = {
  anchor: 0,
  searchMatch: 1,
  neighbor: 2,
  ambient: 3,
} as const;

export interface CosmosLabelCandidate {
  index: number;
  rank: number;
  // point size: the larger node wins inside one rank
  importance: number;
  // label box: horizontal centre and top edge, in screen pixels
  x: number;
  y: number;
}

// each accepted label costs one text measure; this bounds the rejected ones
const MAX_TRIES_PER_LABEL = 6;

// keeps the most important labels that do not overlap an accepted label
export function placeCosmosLabels(opts: {
  candidates: readonly CosmosLabelCandidate[];
  maxLabels: number;
  height: number;
  padding: number;
  measureWidth: (index: number) => number;
}): CosmosLabelCandidate[] {
  const { maxLabels, height, padding, measureWidth } = opts;
  const sorted = [...opts.candidates].sort(
    (a, b) => a.rank - b.rank || b.importance - a.importance,
  );
  const placed: CosmosLabelCandidate[] = [];
  const boxes: { left: number; right: number; top: number; bottom: number }[] =
    [];
  let tries = 0;
  for (const candidate of sorted) {
    if (placed.length >= maxLabels) break;
    if (tries >= maxLabels * MAX_TRIES_PER_LABEL) break;
    tries += 1;
    const halfWidth = measureWidth(candidate.index) / 2 + padding;
    const box = {
      left: candidate.x - halfWidth,
      right: candidate.x + halfWidth,
      top: candidate.y - padding,
      bottom: candidate.y + height + padding,
    };
    // the anchor label always shows
    const overlaps =
      candidate.rank !== COSMOS_LABEL_RANK.anchor &&
      boxes.some(
        (other) =>
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top,
      );
    if (overlaps) continue;
    placed.push(candidate);
    boxes.push(box);
  }
  return placed;
}
