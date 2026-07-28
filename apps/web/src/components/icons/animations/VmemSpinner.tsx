import { cn } from "@vmem/ui";
import { VmemPaths } from "./VmemPaths";

interface VmemSpinnerProps {
  // pixel size for both width and height
  size?: number;
  // extra classes, `currentColor`-driven (e.g. `text-muted`)
  className?: string;
}

// drop-in replacement for `<IconLoader2 className="animate-spin" />` that uses the
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
