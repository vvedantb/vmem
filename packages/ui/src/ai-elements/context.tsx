"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";
import { Progress } from "../ui/progress";
import { cn } from "../utils/cn";
import type { ComponentProps } from "react";
import { createContext, useContext, useMemo } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;
const PERCENT_MAX = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MessageUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  /** Output tokens per second (local inference speed). */
  tokensPerSecond?: number;
}

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
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
// Formatting helpers
// ---------------------------------------------------------------------------

const formatTokens = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact" }).format(n);

const formatPercent = (n: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(n);

// ---------------------------------------------------------------------------
// Compound components
// ---------------------------------------------------------------------------

export type ContextProps = ComponentProps<typeof HoverCard> & {
  usage: MessageUsageSummary;
  usedTokens: number;
  maxTokens: number;
};

/** Root provider — wrap trigger + content. */
export const Context = ({
  usage,
  usedTokens,
  maxTokens,
  ...props
}: ContextProps) => {
  const contextValue = useMemo(
    () => ({ usage, usedTokens, maxTokens }),
    [usage, usedTokens, maxTokens],
  );

  return (
    <ContextContext.Provider value={contextValue}>
      <HoverCard closeDelay={0} openDelay={0} {...props} />
    </ContextContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// ContextIcon — circular SVG progress ring
// ---------------------------------------------------------------------------

export const ContextIcon = () => {
  const { usedTokens, maxTokens } = useContextValue();
  const circumference = 2 * Math.PI * ICON_RADIUS;
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const dashOffset = circumference * (1 - usedPercent);

  return (
    <svg
      aria-label="Context usage"
      height="16"
      role="img"
      style={{ color: "currentcolor" }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="16"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// ContextTrigger — default: compact token count with icon
// ---------------------------------------------------------------------------

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
            "inline-flex items-center gap-1 text-[11px] tabular-nums text-muted hover:text-foreground transition-colors",
            className,
          )}
          {...props}
        >
          <ContextIcon />
          {formatTokens(usage.totalTokens)} tokens
        </button>
      )}
    </HoverCardTrigger>
  );
};

// ---------------------------------------------------------------------------
// ContextContent — hover card wrapper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ContextContentHeader — percentage + progress bar
// ---------------------------------------------------------------------------

export type ContextContentHeaderProps = ComponentProps<"div">;

export const ContextContentHeader = ({
  children,
  className,
  ...props
}: ContextContentHeaderProps) => {
  const { usedTokens, maxTokens } = useContextValue();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;

  return (
    <div className={cn("w-full space-y-2 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <p>{formatPercent(usedPercent)}</p>
            <p className="font-mono text-muted">
              {formatTokens(usedTokens)} / {formatTokens(maxTokens)}
            </p>
          </div>
          <Progress
            className="bg-surface-secondary"
            value={usedPercent * PERCENT_MAX}
          />
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ContextContentBody
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ContextContentFooter
// ---------------------------------------------------------------------------

export type ContextContentFooterProps = ComponentProps<"div">;

export const ContextContentFooter = ({
  children,
  className,
  ...props
}: ContextContentFooterProps) => (
  <div
    className={cn(
      "flex w-full items-center justify-between gap-3 bg-default p-3 text-xs",
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
      <span className="text-muted">Input</span>
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
      <span className="text-muted">Output</span>
      <span>{formatTokens(usage.outputTokens)}</span>
    </div>
  );
};

export type ContextReasoningUsageProps = ComponentProps<"div">;

export const ContextReasoningUsage = ({
  className,
  children,
  ...props
}: ContextReasoningUsageProps) => {
  const { usage } = useContextValue();
  if (children) return <>{children}</>;
  if (!usage.reasoningTokens) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted">Reasoning</span>
      <span>{formatTokens(usage.reasoningTokens)}</span>
    </div>
  );
};

export type ContextCacheUsageProps = ComponentProps<"div">;

export const ContextCacheUsage = ({
  className,
  children,
  ...props
}: ContextCacheUsageProps) => {
  const { usage } = useContextValue();
  if (children) return <>{children}</>;
  if (!usage.cachedInputTokens) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted">Cache</span>
      <span>{formatTokens(usage.cachedInputTokens)}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Speed row — tokens per second
// ---------------------------------------------------------------------------

export type ContextSpeedUsageProps = ComponentProps<"div">;

export const ContextSpeedUsage = ({
  className,
  children,
  ...props
}: ContextSpeedUsageProps) => {
  const { usage } = useContextValue();
  if (children) return <>{children}</>;
  if (!usage.tokensPerSecond || usage.tokensPerSecond <= 0) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted">Speed</span>
      <span>{usage.tokensPerSecond.toFixed(1)} tok/s</span>
    </div>
  );
};
