import { clampGraphTooltipPosition } from "./graph-tooltip-position";

interface GraphNodeTooltipProps {
  title: string;
  viewportX: number;
  viewportY: number;
}

export default function GraphNodeTooltip({
  title,
  viewportX,
  viewportY,
}: GraphNodeTooltipProps) {
  const { left, top } = clampGraphTooltipPosition(viewportX, viewportY);

  return (
    <div
      className="absolute glass-panel-strong rounded-lg px-3 py-2 max-w-xs pointer-events-none z-10 hidden md:block"
      style={{ left, top }}
    >
      <p className="font-medium text-foreground">{title}</p>
    </div>
  );
}
