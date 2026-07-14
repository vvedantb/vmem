"use client";

import type { ReactNode } from "react";
import { cn } from "@vmem/ui";
import { SidebarClearSearchInput } from "@/components/sidebar/SidebarClearSearchInput";

interface SkillsSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  // trailing chrome (Add, Select) on the same row as the input
  actions?: ReactNode;
  className?: string;
}

export function SkillsSearchBar({
  value,
  onChange,
  actions,
  className,
}: SkillsSearchBarProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">
          <SidebarClearSearchInput
            value={value}
            onChange={onChange}
            placeholder="Search skills"
            aria-label="Search skills"
            wrapperClassName="mb-0"
          />
        </div>
        {actions}
      </div>
    </div>
  );
}
