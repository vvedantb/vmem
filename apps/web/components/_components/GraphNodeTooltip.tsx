"use client";

interface GraphNodeTooltipProps {
  title: string;
  content: string;
  x: number;
  y: number;
}

export default function GraphNodeTooltip({
  title,
  content,
  x,
  y,
}: GraphNodeTooltipProps) {
  return (
    <div
      role="tooltip"
      className="absolute glass-panel rounded-lg p-3 max-w-xs pointer-events-none z-10"
      style={{ left: x + 12, top: y - 10 }}
    >
      <p className="font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground line-clamp-2">{content}</p>
    </div>
  );
}
