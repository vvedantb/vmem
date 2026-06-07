"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
} from "react";
import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { code } from "./code-highlighter";
import { IconChevronDown } from "@tabler/icons-react";
import { cn } from "../utils/cn";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../ui/collapsible";
import { Shimmer } from "./shimmer";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoning() {
  const ctx = useContext(ReasoningContext);
  if (!ctx) throw new Error("useReasoning must be used within <Reasoning>");
  return ctx;
}

interface ReasoningProps extends Omit<
  ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
}

function Reasoning({
  isStreaming = false,
  open: openProp,
  defaultOpen,
  onOpenChange,
  duration: durationProp,
  children,
  className,
  ...props
}: ReasoningProps) {
  const [isOpenRaw, setIsOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  });
  const isOpen = isOpenRaw ?? false;

  const startTimeRef = useRef<number | null>(null);
  const durationRef = useRef(0);
  const closedManuallyRef = useRef(false);

  useEffect(() => {
    if (isStreaming) {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      if (!closedManuallyRef.current) setIsOpen(true);
    } else if (startTimeRef.current) {
      durationRef.current = Math.round(
        (Date.now() - startTimeRef.current) / 1000,
      );
      startTimeRef.current = null;
      const timer = setTimeout(() => {
        if (!closedManuallyRef.current) setIsOpen(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, setIsOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open) closedManuallyRef.current = true;
    else closedManuallyRef.current = false;
    setIsOpen(open);
  };

  const duration = durationProp ?? durationRef.current;

  return (
    <ReasoningContext.Provider
      value={{ isStreaming, isOpen, setIsOpen, duration }}
    >
      <Collapsible
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={className}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

interface ReasoningTriggerProps extends ComponentProps<
  typeof CollapsibleTrigger
> {
  getThinkingMessage?: (duration: number) => string;
}

function ReasoningTrigger({
  getThinkingMessage,
  className,
  children,
  ...props
}: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration } = useReasoning();

  const thinkingText = isStreaming
    ? "Thinking..."
    : getThinkingMessage
      ? getThinkingMessage(duration)
      : `Thought for ${duration} second${duration !== 1 ? "s" : ""}`;

  return (
    <CollapsibleTrigger
      className={cn(
        "flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors py-1",
        className,
      )}
      {...props}
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-surface-secondary">
        <img
          src="/icon-dark.svg"
          alt="vmem"
          className="size-3.5 block dark:hidden"
        />
        <img
          src="/icon-light.svg"
          alt="vmem"
          className="size-3.5 hidden dark:block"
        />
      </span>
      {children ??
        (isStreaming ? (
          <Shimmer duration={1.5}>{thinkingText}</Shimmer>
        ) : (
          <span>{thinkingText}</span>
        ))}
      <IconChevronDown
        className={cn("size-3.5 transition-transform", isOpen && "rotate-180")}
        stroke={1.5}
      />
    </CollapsibleTrigger>
  );
}

const streamdownPlugins = { cjk, code, math, mermaid };

interface ReasoningContentProps extends Omit<
  ComponentProps<typeof CollapsibleContent>,
  "children"
> {
  children: string;
}

function ReasoningContent({
  children,
  className,
  ...props
}: ReasoningContentProps) {
  return (
    <CollapsibleContent className={cn("pt-2 pb-1", className)} {...props}>
      <div className="rounded-lg bg-surface-secondary/40 p-3">
        <Streamdown
          className="prose prose-sm dark:prose-invert max-w-none text-muted"
          plugins={streamdownPlugins}
        >
          {children}
        </Streamdown>
      </div>
    </CollapsibleContent>
  );
}

export {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
  useReasoning,
  type ReasoningProps,
  type ReasoningTriggerProps,
  type ReasoningContentProps,
};
