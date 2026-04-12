import type { ComponentProps } from "react";
import { cn } from "../utils/cn";

export interface MessageUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type UsageFooterProps = ComponentProps<"span"> & {
  usage: MessageUsageSummary;
};

/**
 * Compact inline token-usage summary rendered beneath assistant messages.
 * Shows input / output / total counts separated by mid-dots.
 */
export function UsageFooter({ usage, className, ...props }: UsageFooterProps) {
  return (
    <span
      className={cn(
        "text-[11px] text-muted-foreground tabular-nums",
        className,
      )}
      {...props}
    >
      {usage.inputTokens.toLocaleString()} in &middot;{" "}
      {usage.outputTokens.toLocaleString()} out &middot;{" "}
      {usage.totalTokens.toLocaleString()} tokens
    </span>
  );
}
