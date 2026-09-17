import type { GraphEdgeType } from "@/lib/graph/types";
import { clampGraphTooltipPosition } from "./graph-tooltip-position";

interface GraphEdgeTooltipProps {
  edgeType: GraphEdgeType;
  sourceTitle: string;
  targetTitle: string;
  reason: string | null;
  score?: number;
  viewportX: number;
  viewportY: number;
}

const EDGE_TYPE_LABEL: Record<GraphEdgeType, string> = {
  tag: "Shared tags",
  relates_to: "Related",
  wiki_parent: "Parent folder",
  mentions: "Mentions",
};

export default function GraphEdgeTooltip({
  edgeType,
  sourceTitle,
  targetTitle,
  reason,
  score,
  viewportX,
  viewportY,
}: GraphEdgeTooltipProps) {
  const { left, top } = clampGraphTooltipPosition(viewportX, viewportY);
  const label = EDGE_TYPE_LABEL[edgeType];

  return (
    <div
      className="absolute glass-panel-strong smooth-shadow-ring-md rounded-lg p-3 max-w-xs pointer-events-none z-10 hidden md:block"
      style={{ left, top }}
    >
      <p className="font-medium text-foreground text-xs mb-1">
        {sourceTitle} ↔ {targetTitle}
      </p>
      <p className="text-xs text-muted">
        {label}
        {reason === "semantic similarity" && score !== undefined
          ? ` · semantic similarity (${Math.round(score * 100)}%)`
          : reason
            ? ` · ${reason}`
            : ""}
      </p>
    </div>
  );
}
