import { cn } from "@vmem/ui";
import { VmemPaths } from "./VmemPaths";

interface VmemSpinnerProps {
  /** Pixel size for both width and height. Default 24 — same as `IconLoader2 h-6 w-6`. */
  size?: number;
  /** Extra classes — `currentColor` driven, so `text-muted` etc. works. */
  className?: string;
}

/**
 * Drop-in replacement for `<IconLoader2 className="animate-spin" />` that uses
 * the petal sequencer animation (#2 in the playground): each petal of the
 * vmem logo lights up in turn — left → right → top — making a calmer, more
 * branded loading indicator than a generic spinning circle.
 *
 * Same color contract as IconLoader2: inherits from `currentColor`, so
 * Tailwind text-color utilities just work. Loops indefinitely while mounted.
 */
export function VmemSpinner({ size = 24, className }: VmemSpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 210 204"
      role="status"
      aria-label="Loading"
      className={cn("vmem-sequencer", className)}
      style={{ display: "block", overflow: "visible" }}
    >
      <VmemPaths pathClassName="vmem-petal" />
    </svg>
  );
}
