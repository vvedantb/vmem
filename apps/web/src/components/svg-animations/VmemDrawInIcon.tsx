"use client";

import { cn } from "@vmem/ui";
import { VmemPaths } from "./VmemPaths";

interface VmemDrawInIconProps {
  /** Pixel size for both width and height. Default 22 (sidebar default). */
  size?: number;
  /** Extra classes — `currentColor` driven, so `text-foreground` etc. works. */
  className?: string;
}

/**
 * vmem logo with a one-shot stroke draw-in animation on mount, replayed when
 * the parent `.group` link is hovered in (see `vmem-anim.css`). After mount,
 * paths stay in the settled state so hover-out does not replay the intro.
 *
 * Sized via inline width/height attributes rather than the `.vmem-svg` class
 * so callers can pin it at a specific px size (sidebar uses 22).
 */
function handleMountAnimationEnd(event: React.AnimationEvent<SVGSVGElement>) {
  if (event.animationName !== "vmem-draw-in") return;

  const target = event.target;
  if (!(target instanceof SVGPathElement)) return;

  const paths = event.currentTarget.querySelectorAll("path");
  const lastPath = paths[paths.length - 1];
  if (target !== lastPath) return;

  event.currentTarget.classList.add("vmem-draw-in-mounted");
}

export function VmemDrawInIcon({ size = 22, className }: VmemDrawInIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 210 204"
      aria-hidden="true"
      className={cn("vmem-draw-in", className)}
      style={{ display: "block", overflow: "visible" }}
      onAnimationEnd={handleMountAnimationEnd}
    >
      <VmemPaths normalizePath />
    </svg>
  );
}
