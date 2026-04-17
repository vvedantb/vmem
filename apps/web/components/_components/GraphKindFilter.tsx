"use client";

import { Checkbox, Button } from "@vmem/ui";
import { nodeColor } from "./graph-colors";
import type { KindStat } from "./graph-data";
import type { GraphNodeKind } from "./canvas/types";

interface GraphKindFilterProps {
  kinds: KindStat[];
  activeKinds: Set<GraphNodeKind>;
  onToggle: (kind: GraphNodeKind) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  isDark: boolean;
}

const KIND_LABELS: Record<GraphNodeKind, string> = {
  memory: "Memories",
  "wiki-document": "Wiki docs",
  "wiki-folder": "Folders",
  skill: "Skills",
};

/** Flat-topped hexagon clip-path matching the canvas renderer's skill shape. */
const HEX_CLIP_PATH =
  "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)";

/**
 * Small shape indicator matching the canvas: circle for memories, diamond for
 * wiki documents, square for folders, hexagon for skills. Acts as the legend
 * inside the Types filter — each row shows the exact shape it will toggle on
 * the canvas.
 */
function ShapeIndicator({
  kind,
  color,
}: {
  kind: GraphNodeKind;
  color: string;
}) {
  const base = "w-2 h-2 flex-shrink-0";
  switch (kind) {
    case "memory":
      return (
        <span
          className={`${base} rounded-full`}
          style={{ backgroundColor: color }}
          aria-hidden
        />
      );
    case "wiki-document":
      return (
        <span
          className={`${base} rotate-45`}
          style={{ backgroundColor: color }}
          aria-hidden
        />
      );
    case "wiki-folder":
      return (
        <span className={base} style={{ backgroundColor: color }} aria-hidden />
      );
    case "skill":
      return (
        <span
          className={base}
          style={{ backgroundColor: color, clipPath: HEX_CLIP_PATH }}
          aria-hidden
        />
      );
  }
}

export default function GraphKindFilter({
  kinds,
  activeKinds,
  onToggle,
  onSelectAll,
  onClearAll,
  isDark,
}: GraphKindFilterProps) {
  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onSelectAll}
          className="h-5 px-1.5 text-[10px] text-muted-foreground"
        >
          All
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-5 px-1.5 text-[10px] text-muted-foreground"
        >
          None
        </Button>
      </div>

      <div className="space-y-0.5 pr-1">
        {kinds.map((stat) => {
          const checked = activeKinds.has(stat.kind);
          const color = nodeColor([], stat.kind, isDark, null);
          return (
            <label
              key={stat.kind}
              className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-foreground/5 cursor-pointer"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(stat.kind)}
                className="h-3.5 w-3.5"
              />
              <ShapeIndicator kind={stat.kind} color={color} />
              <span className="text-xs text-foreground truncate flex-1">
                {KIND_LABELS[stat.kind]}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground/60">
                {stat.count}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
