import { cn } from "@vmem/ui";
import { VmemPaths } from "./VmemPaths";

interface VmemThinkingLoaderProps {
  /** Pixel size for both width and height. Default 28. */
  size?: number;
  /** Extra classes — `currentColor` driven, so `text-muted-foreground` etc. works. */
  className?: string;
}

/**
 * Used for the chat assistant's "thinking" / activity-step indicator.
 * Wraps the stroke trace loop animation (#3 in the playground): each petal's
 * outline draws in then erases out on a loop, giving a continuous "working"
 * feel that's quieter than three pulsing dots and on-brand with the logo.
 *
 * Loops indefinitely while mounted — there's no terminal state.
 */
export function VmemThinkingLoader({
  size = 28,
  className,
}: VmemThinkingLoaderProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 210 204"
      role="status"
      aria-label="Thinking"
      className={cn("vmem-trace", className)}
      style={{ display: "block", overflow: "visible" }}
    >
      <VmemPaths normalizePath />
    </svg>
  );
}
