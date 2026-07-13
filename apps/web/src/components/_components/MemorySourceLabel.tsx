import { cn } from "@vmem/ui";
import { formatMemorySourceLabel } from "@/lib/memories";
import { MemorySourceIcon } from "./MemorySourceIcon";

type MemorySourceLabelProps = {
  source: string;
  size?: number;
  className?: string;
  labelClassName?: string;
};

export function MemorySourceLabel({
  source,
  size = 14,
  className,
  labelClassName,
}: MemorySourceLabelProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <MemorySourceIcon source={source} size={size} className="shrink-0" />
      <span className={labelClassName}>{formatMemorySourceLabel(source)}</span>
    </span>
  );
}
