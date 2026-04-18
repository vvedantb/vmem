"use client";

interface GraphLegendProps {
  nodeCount: number;
  edgeCount: number;
  visibleNodeCount: number;
}

export default function GraphLegend({
  nodeCount,
  edgeCount,
  visibleNodeCount,
}: GraphLegendProps) {
  const fmt = (n: number) => n.toLocaleString();
  const isFiltered = visibleNodeCount < nodeCount;

  return (
    <div className="space-y-2 text-[11px] text-muted-foreground">
      {/* Stats */}
      <p className="tabular-nums">
        {isFiltered ? (
          <>
            {fmt(visibleNodeCount)} / {fmt(nodeCount)} nodes
          </>
        ) : (
          <>{fmt(nodeCount)} nodes</>
        )}
        {" · "}
        {fmt(edgeCount)} edges
      </p>

      {/* Color explanation */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
          <span>Color = first tag</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-px bg-muted-foreground/50" />
          <span>Tag edge</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-0.5 bg-muted-foreground/70" />
          <span>Relates-to edge</span>
        </div>
      </div>
    </div>
  );
}
