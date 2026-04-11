"use client";

import { createContext, useContext, useMemo, type ComponentProps } from "react";
import { cn } from "../utils/cn";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "../ui/hover-card";
import { Progress } from "../ui/progress";
import { Button } from "../ui/button";

const ICON_RADIUS = 10;
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 2;
const PERCENT_MAX = 100;

interface ContextUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

interface ContextSchema {
  usedTokens: number;
  maxTokens: number;
  usage?: ContextUsage;
}

const ContextReactContext = createContext<ContextSchema | null>(null);

function useContextUsage() {
  const context = useContext(ContextReactContext);
  if (!context) {
    throw new Error("Context components must be used within <Context>");
  }
  return context;
}

// --- Context (root wrapper) ---

type ContextProps = ComponentProps<typeof HoverCard> & ContextSchema;

function Context({ usedTokens, maxTokens, usage, ...props }: ContextProps) {
  const contextValue = useMemo(
    () => ({ usedTokens, maxTokens, usage }),
    [usedTokens, maxTokens, usage],
  );

  return (
    <ContextReactContext.Provider value={contextValue}>
      <HoverCard closeDelay={0} openDelay={0} {...props} />
    </ContextReactContext.Provider>
  );
}

// --- ContextIcon (circular progress SVG) ---

function ContextIcon() {
  const { usedTokens, maxTokens } = useContextUsage();
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
}

// --- ContextTrigger ---

type ContextTriggerProps = ComponentProps<typeof Button>;

function ContextTrigger({ children, ...props }: ContextTriggerProps) {
  const { usedTokens, maxTokens } = useContextUsage();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const renderedPercent = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(usedPercent);

  return (
    <HoverCardTrigger asChild>
      {children ?? (
        <Button type="button" variant="ghost" size="sm" {...props}>
          <ContextIcon />
          <span className="font-medium text-muted-foreground">
            {renderedPercent}
          </span>
        </Button>
      )}
    </HoverCardTrigger>
  );
}

// --- ContextContent ---

type ContextContentProps = ComponentProps<typeof HoverCardContent>;

function ContextContent({ className, ...props }: ContextContentProps) {
  return (
    <HoverCardContent
      className={cn("min-w-60 divide-y overflow-hidden p-0", className)}
      {...props}
    />
  );
}

// --- ContextContentHeader ---

type ContextContentHeaderProps = ComponentProps<"div">;

function ContextContentHeader({
  children,
  className,
  ...props
}: ContextContentHeaderProps) {
  const { usedTokens, maxTokens } = useContextUsage();
  const usedPercent = maxTokens > 0 ? usedTokens / maxTokens : 0;
  const displayPct = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(usedPercent);
  const used = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(usedTokens);
  const total = new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(maxTokens);

  return (
    <div className={cn("w-full space-y-2 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <p>{displayPct}</p>
            <p className="font-mono text-muted-foreground">
              {used} / {total}
            </p>
          </div>
          <Progress className="bg-muted" value={usedPercent * PERCENT_MAX} />
        </>
      )}
    </div>
  );
}

// --- ContextContentBody ---

type ContextContentBodyProps = ComponentProps<"div">;

function ContextContentBody({
  children,
  className,
  ...props
}: ContextContentBodyProps) {
  return (
    <div className={cn("w-full space-y-1.5 p-3", className)} {...props}>
      {children}
    </div>
  );
}

// --- Token formatting helper ---

function formatTokens(tokens: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
  }).format(tokens);
}

// --- ContextInputUsage ---

type ContextInputUsageProps = ComponentProps<"div">;

function ContextInputUsage({
  className,
  children,
  ...props
}: ContextInputUsageProps) {
  const { usage } = useContextUsage();
  const tokens = usage?.promptTokens ?? 0;

  if (children) return <>{children}</>;
  if (!tokens) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted-foreground">Input</span>
      <span>{formatTokens(tokens)}</span>
    </div>
  );
}

// --- ContextOutputUsage ---

type ContextOutputUsageProps = ComponentProps<"div">;

function ContextOutputUsage({
  className,
  children,
  ...props
}: ContextOutputUsageProps) {
  const { usage } = useContextUsage();
  const tokens = usage?.completionTokens ?? 0;

  if (children) return <>{children}</>;
  if (!tokens) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted-foreground">Output</span>
      <span>{formatTokens(tokens)}</span>
    </div>
  );
}

// --- ContextReasoningUsage ---

type ContextReasoningUsageProps = ComponentProps<"div">;

function ContextReasoningUsage({
  className,
  children,
  ...props
}: ContextReasoningUsageProps) {
  const { usage } = useContextUsage();
  const tokens = usage?.reasoningTokens ?? 0;

  if (children) return <>{children}</>;
  if (!tokens) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted-foreground">Reasoning</span>
      <span>{formatTokens(tokens)}</span>
    </div>
  );
}

// --- ContextCacheUsage ---

type ContextCacheUsageProps = ComponentProps<"div">;

function ContextCacheUsage({
  className,
  children,
  ...props
}: ContextCacheUsageProps) {
  const { usage } = useContextUsage();
  const tokens = usage?.cachedInputTokens ?? 0;

  if (children) return <>{children}</>;
  if (!tokens) return null;

  return (
    <div
      className={cn("flex items-center justify-between text-xs", className)}
      {...props}
    >
      <span className="text-muted-foreground">Cache</span>
      <span>{formatTokens(tokens)}</span>
    </div>
  );
}

export {
  Context,
  ContextIcon,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextCacheUsage,
  useContextUsage,
  type ContextProps,
  type ContextTriggerProps,
  type ContextContentProps,
  type ContextContentHeaderProps,
  type ContextContentBodyProps,
  type ContextInputUsageProps,
  type ContextOutputUsageProps,
  type ContextReasoningUsageProps,
  type ContextCacheUsageProps,
  type ContextUsage,
};
