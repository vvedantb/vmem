"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";
import { cn } from "../utils/cn";
import type { ComponentProps } from "react";
import { createContext, useContext, useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface ContextSchema {
  usage: MessageUsageSummary;
}

// ---------------------------------------------------------------------------
// Internal React context
// ---------------------------------------------------------------------------

const ContextContext = createContext<ContextSchema | null>(null);

const useContextValue = () => {
  const context = useContext(ContextContext);
  if (!context) {
    throw new Error("Context components must be used within <Context>");
  }
  return context;
};

// ---------------------------------------------------------------------------
// Formatting helper
// ---------------------------------------------------------------------------

const formatTokens = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact" }).format(n);

// ---------------------------------------------------------------------------
// Compound components
// ---------------------------------------------------------------------------

export type ContextProps = ComponentProps<typeof HoverCard> & {
  usage: MessageUsageSummary;
};

/** Root provider — wrap trigger + content. */
export const Context = ({ usage, ...props }: ContextProps) => {
  const contextValue = useMemo(() => ({ usage }), [usage]);

  return (
    <ContextContext.Provider value={contextValue}>
      <HoverCard closeDelay={0} openDelay={0} {...props} />
    </ContextContext.Provider>
  );
};

/** Default trigger: compact total-token count. */
export type ContextTriggerProps = ComponentProps<"button">;

export const ContextTrigger = ({
  children,
  className,
  ...props
}: ContextTriggerProps) => {
  const { usage } = useContextValue();

  return (
    <HoverCardTrigger asChild>
      {children ?? (
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground hover:text-foreground transition-colors",
            className,
          )}
          {...props}
        >
          {formatTokens(usage.totalTokens)} tokens
        </button>
      )}
    </HoverCardTrigger>
  );
};

/** Hover card content wrapper. */
export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export const ContextContent = ({
  className,
  ...props
}: ContextContentProps) => (
  <HoverCardContent
    className={cn("min-w-48 w-auto divide-y overflow-hidden p-0", className)}
    {...props}
  />
);

/** Header section inside the hover card. */
export type ContextContentHeaderProps = ComponentProps<"div">;

export const ContextContentHeader = ({
  children,
  className,
  ...props
}: ContextContentHeaderProps) => {
  const { usage } = useContextValue();

  return (
    <div className={cn("w-full space-y-1 p-3", className)} {...props}>
      {children ?? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono">{formatTokens(usage.totalTokens)}</span>
        </div>
      )}
    </div>
  );
};

/** Body section — usually contains usage rows. */
export type ContextContentBodyProps = ComponentProps<"div">;

export const ContextContentBody = ({
  children,
  className,
  ...props
}: ContextContentBodyProps) => (
  <div className={cn("w-full space-y-1 p-3", className)} {...props}>
    {children}
  </div>
);

/** Footer section. */
export type ContextContentFooterProps = ComponentProps<"div">;

export const ContextContentFooter = ({
  children,
  className,
  ...props
}: ContextContentFooterProps) => (
  <div
    className={cn(
      "flex w-full items-center justify-between gap-3 bg-secondary p-3 text-xs",
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Usage breakdown rows
// ---------------------------------------------------------------------------

export type ContextInputUsageProps = ComponentProps<"div">;

export const ContextInputUsage = ({
  className,
  children,
  ...props
}: ContextInputUsageProps) => {
  const { usage } = useContextValue();
  if (children) return <>{children}</>;
  if (!usage.inputTokens) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted-foreground">Input</span>
      <span>{formatTokens(usage.inputTokens)}</span>
    </div>
  );
};

export type ContextOutputUsageProps = ComponentProps<"div">;

export const ContextOutputUsage = ({
  className,
  children,
  ...props
}: ContextOutputUsageProps) => {
  const { usage } = useContextValue();
  if (children) return <>{children}</>;
  if (!usage.outputTokens) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted-foreground">Output</span>
      <span>{formatTokens(usage.outputTokens)}</span>
    </div>
  );
};
