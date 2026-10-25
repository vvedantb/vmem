// AI-generated (Claude), prompt: "shared svg petal paths for the vmem logo animations"
// Modified by me: per petal classname hooks
import { APP_MARKS, markLinecap, markStrokeWidth } from "@vvedantb/ui/brand";
import "./vmem-anim.css";

// the three arcs of the shared vmem mark sit on one circle (r 227, centre 512). Crop the 1024 grid to it so a small spinner stays legible.
export const VMEM_MARK_VIEWBOX = "256 256 512 512";
const { paths } = APP_MARKS.vmem;

interface VmemPathsProps {
  // class applied to every petal, combine with `:nth-child` selectors
  pathClassName?: string;
}

// renders the vmem mark arcs as stroked `<path>` siblings inside a parent `<svg>` that uses `VMEM_MARK_VIEWBOX`
export function VmemPaths({ pathClassName }: VmemPathsProps) {
  return (
    <g
      fill="none"
      stroke="currentColor"
      strokeWidth={markStrokeWidth("vmem")}
      strokeLinecap={markLinecap("vmem")}
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} className={pathClassName} />
      ))}
    </g>
  );
}
