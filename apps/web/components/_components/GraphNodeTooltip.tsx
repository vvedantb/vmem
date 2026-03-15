"use client";

interface GraphNodeTooltipProps {
  title: string;
  content: string;
}

export default function GraphNodeTooltip({
  title,
  content,
}: GraphNodeTooltipProps) {
  return (
    <div className="absolute top-3 left-3 glass-panel rounded-lg p-3 max-w-xs pointer-events-none z-10">
      <p className="font-medium text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground line-clamp-2">{content}</p>
    </div>
  );
}
