import { cn } from "@vmem/ui";
import type { ListItemKind } from "@/lib/list-items";

// flat-topped hexagon clip path
const HEX_CLIP_PATH =
  "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)";

// 8-pointed star clip path mirrors the canvas renderer's starburst shape for entity hub nodes
const STAR_CLIP_PATH =
  "polygon(50% 0%, 65% 35%, 100% 50%, 65% 65%, 50% 100%, 35% 65%, 0% 50%, 35% 35%)";

interface ShapeIndicatorProps {
  kind: ListItemKind;
  color: string;
  // tailwind size classes
  className?: string;
}

// tiny shape swatch circle for memories, diamond for wiki documents, square for
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
    case "wiki-artifact":
      return (
        <span
          className={cn(base, "rounded-sm")}
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
    case "entity":
      return (
        <span
          className={base}
          style={{ backgroundColor: color, clipPath: STAR_CLIP_PATH }}
          aria-hidden
        />
      );
  }
}
