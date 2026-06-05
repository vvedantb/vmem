"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ComponentProps,
} from "react";
import {
  IconChevronDown,
  IconTool,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";
import { cn } from "../utils/cn";
import { CodeBlock } from "./code-block";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";

type ToolState =
  | "input-available"
  | "running"
  | "output-available"
  | "output-error";

type ToolProps = ComponentProps<typeof Collapsible> & {
  name: string;
  state?: ToolState;
};

function scrollToolContentToBottom(element: HTMLDivElement | null) {
  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

function Tool({
  name,
  state = "input-available",
  className,
  children,
  onOpenChange,
  ...props
}: ToolProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    scrollToolContentToBottom(scrollRef.current);
  }, [children]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        requestAnimationFrame(() => {
          scrollToolContentToBottom(scrollRef.current);
        });
      }
      onOpenChange?.(open);
    },
    [onOpenChange],
  );

  return (
    <Collapsible
      defaultOpen={state === "running" || state === "output-error"}
      onOpenChange={handleOpenChange}
      className={cn("rounded-lg bg-surface-secondary/40", className)}
      {...props}
    >
      <ToolHeader name={name} state={state} />
      <CollapsibleContent className="bg-surface-secondary/20 rounded-b-lg">
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto scrollbar-thin px-3 py-2 [scrollbar-gutter:stable]"
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolHeader({ name, state }: { name: string; state: ToolState }) {
  return (
    <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs">
      <span className="inline-flex items-center gap-1.5">
        {state === "running" ? (
          <IconLoader2
            className="size-3.5 animate-spin text-accent"
            stroke={1.5}
          />
        ) : state === "output-available" ? (
          <IconCheck className="size-3.5 text-success" stroke={1.5} />
        ) : (
          <IconTool className="size-3.5 text-muted" stroke={1.5} />
        )}
        <span className="font-medium text-foreground">{name}</span>
        <span className="text-muted">{toolStateLabel(state)}</span>
      </span>
      <IconChevronDown className="size-3.5 text-muted transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
}

type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
};

function ToolInput({ input, className, ...props }: ToolInputProps) {
  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Input
      </p>
      <CodeBlock
        code={
          typeof input === "string" ? input : JSON.stringify(input, null, 2)
        }
        language="json"
      />
    </div>
  );
}

type ToolOutputProps = ComponentProps<"div"> & {
  output: unknown;
};

function ToolOutput({ output, className, ...props }: ToolOutputProps) {
  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Output
      </p>
      <CodeBlock
        code={
          typeof output === "string" ? output : JSON.stringify(output, null, 2)
        }
        language="json"
      />
    </div>
  );
}

function toolStateLabel(state: ToolState) {
  if (state === "input-available") return "(input available)";
  if (state === "running") return "(running)";
  if (state === "output-available") return "(output available)";
  return "(error)";
}

export {
  Tool,
  ToolInput,
  ToolOutput,
  type ToolProps,
  type ToolInputProps,
  type ToolOutputProps,
  type ToolState,
};
