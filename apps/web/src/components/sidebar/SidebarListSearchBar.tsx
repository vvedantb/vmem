"use client";

import type { ReactNode } from "react";
import { cn } from "@vmem/ui";
import { SidebarClearSearchInput } from "@/components/sidebar/SidebarClearSearchInput";

interface SidebarListSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  "aria-label": string;
  // trailing chrome (Add, Select) on the same row as the input
  actions?: ReactNode;
  className?: string;
}

export function SidebarListSearchBar({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
  actions,
  className,
}: SidebarListSearchBarProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <SidebarClearSearchInput
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            aria-label={ariaLabel}
            wrapperClassName="mb-0"
          />
        </div>
        {actions}
      </div>
    </div>
  );
}
