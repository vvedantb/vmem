"use client";

import { IconSearch } from "@tabler/icons-react";
import { Input } from "@vmem/ui";
import { sidebarSearchInputClassName } from "@/components/sidebar/sidebar-search-input";

interface CodebasesSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function CodebasesSearchBar({
  value,
  onChange,
}: CodebasesSearchBarProps) {
  return (
    <div className="relative mb-2">
      <IconSearch
        size={14}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search repositories"
        className={sidebarSearchInputClassName}
        aria-label="Search repositories"
      />
    </div>
  );
}
