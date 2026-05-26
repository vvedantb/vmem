"use client";

import type { ComponentProps } from "react";
import {
  IconChevronDown,
  IconExternalLink,
  IconLink,
} from "@tabler/icons-react";
import { cn } from "../utils/cn";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";

type SourcesProps = ComponentProps<typeof Collapsible>;

function Sources({ className, children, ...props }: SourcesProps) {
  return (
    <Collapsible className={cn("w-full", className)} {...props}>
      {children}
    </Collapsible>
  );
}

type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
  label?: string;
};

function SourcesTrigger({
  className,
  count,
  label = "sources",
  children,
  ...props
}: SourcesTriggerProps) {
  return (
    <CollapsibleTrigger
      className={cn(
        "group inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <IconLink className="size-3.5" stroke={1.5} />
          <span>
            {count} {label}
          </span>
          <IconChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
        </>
      )}
    </CollapsibleTrigger>
  );
}

type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

function SourcesContent({
  className,
  children,
  ...props
}: SourcesContentProps) {
  return (
    <CollapsibleContent className={cn("mt-2 space-y-2", className)} {...props}>
      {children}
    </CollapsibleContent>
  );
}

type SourceProps = ComponentProps<"a">;

function Source({ className, children, ...props }: SourceProps) {
  return (
    <a
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center justify-between gap-2 rounded-md bg-surface-secondary/50 px-3 py-2 text-xs text-muted hover:bg-surface-tertiary hover:text-foreground transition-colors",
        className,
      )}
      {...props}
    >
      <span className="line-clamp-1">{children}</span>
      <IconExternalLink className="size-3.5 shrink-0" stroke={1.5} />
    </a>
  );
}

export {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
  type SourcesProps,
  type SourcesTriggerProps,
  type SourcesContentProps,
  type SourceProps,
};
