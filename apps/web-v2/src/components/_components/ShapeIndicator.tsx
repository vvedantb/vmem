import { cn } from "@vmem/ui";
import type { ListItemKind } from "@/lib/list-items";

/**
 * Flat-topped hexagon clip-path — mirrors the canvas renderer's skill shape
 * exactly so the legend/indicator matches what's drawn on the graph.
 */
const HEX_CLIP_PATH =
  "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)";

interface ShapeIndicatorProps {
  kind: ListItemKind;
  color: string;
  /** Tailwind size classes. Defaults to `w-2 h-2` to match the graph legend. */
  className?: string;
}

/**
 * Tiny shape swatch — circle for memories, diamond for wiki documents, square
 * for folders, hexagon for skills. Used by the list-row renderer and the kind
 * filter so the list view reads the same visual language as the graph.
 */
export default function ShapeIndicator({
  kind,
  color,
  className,
}: ShapeIndicatorProps) {
  const base = cn("flex-shrink-0", className ?? "w-2 h-2");
  switch (kind) {
    case "memory":
      return (
        <span
          className={cn(base, "rounded-full")}
          style={{ backgroundColor: color }}
          aria-hidden
        />
      );
    case "wiki-document":
      return (
        <span
          className={cn(base, "rotate-45")}
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
