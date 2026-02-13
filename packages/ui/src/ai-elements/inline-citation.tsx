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
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium align-middle border border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
        className,
      )}
      {...props}
    >
      {children ?? `[${index}]`}
    </a>
  );
}

export { InlineCitation, type InlineCitationProps };
