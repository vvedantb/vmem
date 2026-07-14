"use client";

interface GraphNodeTooltipProps {
  title: string;
  viewportX: number;
  viewportY: number;
}

const TOOLTIP_W = 256;
const TOOLTIP_OFFSET = 16;

export default function GraphNodeTooltip({
  title,
  viewportX,
  viewportY,
}: GraphNodeTooltipProps) {
  // use window dimensions for clamping — graph container fills the viewport
  const cw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const ch = typeof window !== "undefined" ? window.innerHeight : 800;

  let left = viewportX + TOOLTIP_OFFSET;
  let top = viewportY - 20;

  if (left + TOOLTIP_W > cw) {
    left = viewportX - TOOLTIP_W - TOOLTIP_OFFSET;
  }
  left = Math.max(8, Math.min(left, cw - TOOLTIP_W - 8));
  top = Math.max(8, Math.min(top, ch - 100));

  return (
    <div
      className="absolute glass-panel-strong rounded-lg px-3 py-2 max-w-xs pointer-events-none z-10 hidden md:block"
      style={{ left, top }}
    >
      <p className="font-medium text-foreground">{title}</p>
    </div>
  );
}
