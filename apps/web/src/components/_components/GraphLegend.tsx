"use client";

interface GraphLegendProps {
  nodeCount: number;
  edgeCount: number;
  visibleNodeCount: number;
}

/**
 * Connector logos mirrored on the graph: memories synced from one of these
 * services carry a small brand logo inside their node. Kept in sync with
 * `CONNECTOR_SOURCE_TYPES` in `canvas/connector-logos.ts`.
 */
const CONNECTOR_LEGEND: { src: string; label: string }[] = [
  { src: "/connector-logos/gmail.svg", label: "Gmail" },
  { src: "/connector-logos/google_drive.svg", label: "Google Drive" },
  { src: "/connector-logos/notion.svg", label: "Notion" },
];

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

      {/* Connector source provenance */}
      <div className="space-y-1 pt-1">
        <p className="text-muted-foreground/80">Source</p>
        {CONNECTOR_LEGEND.map(({ src, label }) => (
          <div key={src} className="flex items-center gap-2">
            <img
              src={src}
              alt=""
              width={12}
              height={12}
              aria-hidden
              className="flex-shrink-0"
            />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
