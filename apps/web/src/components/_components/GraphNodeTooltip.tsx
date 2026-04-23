"use client";

interface GraphNodeTooltipProps {
  title: string;
  /**
   * Resolved tooltip body. `undefined` means the parent is still lazy-fetching
   * content (memory nodes don't carry content in the graph payload). Empty
   * string means content was fetched but is genuinely empty — we hide the row
   * in both cases so the tooltip collapses to the title only.
   */
  content?: string;
  viewportX: number;
  viewportY: number;
}

const TOOLTIP_W = 256;
const TOOLTIP_OFFSET = 16;

export default function GraphNodeTooltip({
  title,
  content,
  viewportX,
  viewportY,
}: GraphNodeTooltipProps) {
  // Use window dimensions for clamping — graph container fills the viewport
  const cw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const ch = typeof window !== "undefined" ? window.innerHeight : 800;

  let left = viewportX + TOOLTIP_OFFSET;
  let top = viewportY - 20;

  if (left + TOOLTIP_W > cw) {
    left = viewportX - TOOLTIP_W - TOOLTIP_OFFSET;
  }
  left = Math.max(8, Math.min(left, cw - TOOLTIP_W - 8));
  top = Math.max(8, Math.min(top, ch - 100));

  const hasBody = content !== undefined && content.length > 0;

  return (
    <div
      className="absolute glass-panel rounded-lg p-3 max-w-xs pointer-events-none z-10 hidden md:block"
      style={{ left, top }}
    >
      <p className="font-medium text-foreground mb-1">{title}</p>
      {hasBody && (
        <p className="text-xs text-muted-foreground line-clamp-2">{content}</p>
      )}
    </div>
  );
}
