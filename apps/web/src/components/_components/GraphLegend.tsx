import ShapeIndicator from "./ShapeIndicator";
import type { ListItemKind } from "@/lib/list-items";

// node shapes the renderer dispatches per kind (colour comes from first tag)
const NODE_LEGEND: { kind: ListItemKind; label: string }[] = [
  { kind: "memory", label: "Memory" },
  { kind: "wiki-document", label: "Wiki document" },
  { kind: "wiki-folder", label: "Wiki folder" },
  { kind: "skill", label: "Skill" },
  { kind: "entity", label: "Entity" },
];

// edge categories grouped by the renderer's four colour buckets
const EDGE_LEGEND: {
  label: string;
  swatchClass: string;
  thick?: boolean;
}[] = [
  { label: "Tag", swatchClass: "bg-surface-tertiary/40" },
  { label: "Relates-to", swatchClass: "bg-warning/70", thick: true },
  { label: "Wiki / structural", swatchClass: "bg-foreground/45", thick: true },
  { label: "Mentions", swatchClass: "bg-success/70", thick: true },
];

export default function GraphLegend() {
  return (
    <div className="space-y-3 text-[11px] text-muted">
      {/* Nodes — shape per kind; fill colour is tag-driven, not kind-fixed */}
      <div className="space-y-1">
        <p className="text-muted/80">Nodes</p>
        <p className="text-muted/60 text-[10px]">
          Shape = kind · colour = first tag · size = degree
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-0.5">
          {NODE_LEGEND.map(({ kind, label }) => (
            <div key={kind} className="flex items-center gap-1.5 min-w-0">
              <ShapeIndicator
                kind={kind}
                color="currentColor"
                className="w-2.5 h-2.5"
              />
              <span className="truncate">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Edges — semantic colour per category */}
      <div className="space-y-1">
        <p className="text-muted/80">Edges</p>
        <div className="space-y-1 pt-0.5">
          {EDGE_LEGEND.map(({ label, swatchClass, thick }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`w-4 ${thick ? "h-0.5" : "h-px"} ${swatchClass}`}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* States — what dimming/highlight means */}
      <div className="space-y-1">
        <p className="text-muted/80">States</p>
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-foreground/80" />
            <span>Hover · neighbours stay lit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
            <span>Dimmed · filtered or off-path</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-foreground/60" />
            <span>Focused · 2-hop neighbourhood</span>
          </div>
        </div>
      </div>
    </div>
  );
}
