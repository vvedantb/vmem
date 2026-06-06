"use client";

import type { ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@vmem/ui";

type SidebarIconTooltipProps = {
  label: string;
  enabled: boolean;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
};

/** Radix tooltip for icon-only sidebar rail — skipped when labels are visible. */
export function SidebarIconTooltip({
  label,
  enabled,
  children,
  side = "right",
}: SidebarIconTooltipProps) {
  if (!enabled) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
