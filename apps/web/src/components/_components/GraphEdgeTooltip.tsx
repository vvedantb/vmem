"use client";

import type { GraphEdgeType } from "./canvas/types";

interface GraphEdgeTooltipProps {
  edgeType: GraphEdgeType;
  sourceTitle: string;
  targetTitle: string;
  reason: string | null;
  score?: number;
  viewportX: number;
  viewportY: number;
}

const TOOLTIP_W = 256;
const TOOLTIP_OFFSET = 16;

const EDGE_TYPE_LABEL: Record<GraphEdgeType, string> = {
  tag: "Shared tags",
  relates_to: "Related",
  wiki_parent: "Parent folder",
  imports: "Imports",
  mentions: "Mentions",
  // Phase 1 codebase edges — these tooltips also flow through the same
  // canvas in `CodebaseGraph.tsx`, so each new GraphEdgeType needs a label.
  calls: "Calls",
  contains: "Contains",
  has_method: "Has method",
  extends: "Extends",
  implements: "Implements",
  starts_process: "Starts process",
  includes: "In process",
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
  const cw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const ch = typeof window !== "undefined" ? window.innerHeight : 800;

  let left = viewportX + TOOLTIP_OFFSET;
  let top = viewportY - 20;

  if (left + TOOLTIP_W > cw) {
    left = viewportX - TOOLTIP_W - TOOLTIP_OFFSET;
  }
  left = Math.max(8, Math.min(left, cw - TOOLTIP_W - 8));
  top = Math.max(8, Math.min(top, ch - 100));

  const label = EDGE_TYPE_LABEL[edgeType];

  return (
    <div
      className="absolute glass-panel rounded-lg p-3 max-w-xs pointer-events-none z-10 hidden md:block"
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
