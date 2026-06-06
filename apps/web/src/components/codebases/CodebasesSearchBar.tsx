"use client";

import { SidebarClearSearchInput } from "@/components/sidebar/SidebarClearSearchInput";

interface CodebasesSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function CodebasesSearchBar({
  value,
  onChange,
}: CodebasesSearchBarProps) {
  return (
    <SidebarClearSearchInput
      value={value}
      onChange={onChange}
      placeholder="Search repositories"
      aria-label="Search repositories"
    />
  );
}
