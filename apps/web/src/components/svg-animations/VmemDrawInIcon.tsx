import { cn } from "@vmem/ui";
import { VmemPaths } from "./VmemPaths";

interface VmemDrawInIconProps {
  /** Pixel size for both width and height. Default 22 (sidebar default). */
  size?: number;
  /** Extra classes — `currentColor` driven, so `text-foreground` etc. works. */
  className?: string;
}

/**
 * vmem logo with a one-shot stroke draw-in animation on mount.
 *
 * Replaces the static `/icon-light.svg` + `/icon-dark.svg` `<img>` pair: paths
 * fill from `currentColor` so a single component handles both themes. The
 * draw-in animation runs once when the component mounts (`forwards` keyframe
 * fill), so it plays the first time the sidebar appears in a session and then
 * stays in the final filled state until next mount.
 *
 * Sized via inline width/height attributes rather than the `.vmem-svg` class
 * so callers can pin it at a specific px size (sidebar uses 22).
 */
export function VmemDrawInIcon({ size = 22, className }: VmemDrawInIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 210 204"
      aria-hidden="true"
      className={cn("vmem-draw-in", className)}
      style={{ display: "block", overflow: "visible" }}
    >
      <VmemPaths normalizePath />
    </svg>
  );
}
