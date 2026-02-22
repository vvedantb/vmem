"use client";

import type { ComponentProps } from "react";
import { cn } from "../utils/cn";

type InlineCitationProps = ComponentProps<"a"> & {
  index: number;
};

function InlineCitation({
  index,
  className,
  children,
  ...props
}: InlineCitationProps) {
  return (
    <a
      className={cn(
        "inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium align-middle text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children ?? `[${index}]`}
    </a>
  );
}

export { InlineCitation, type InlineCitationProps };
