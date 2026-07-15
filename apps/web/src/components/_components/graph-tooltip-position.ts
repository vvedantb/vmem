const TOOLTIP_W = 256;
const TOOLTIP_OFFSET = 16;

export function clampGraphTooltipPosition(
  viewportX: number,
  viewportY: number,
): { left: number; top: number } {
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

  return { left, top };
}
