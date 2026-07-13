"use client";

import type { ComponentProps } from "react";
import { cn } from "../utils/cn";

type ToolbarProps = ComponentProps<"div">;

function Toolbar({ className, ...props }: ToolbarProps) {
  return (
    <div
      className={cn("flex items-center justify-between gap-2", className)}
      {...props}
    />
  );
}

type ToolbarSectionProps = ComponentProps<"div">;

function ToolbarSection({ className, ...props }: ToolbarSectionProps) {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props} />
  );
}

export { Toolbar, ToolbarSection, type ToolbarProps, type ToolbarSectionProps };
