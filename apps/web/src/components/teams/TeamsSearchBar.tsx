"use client";

import { SidebarClearSearchInput } from "@/components/sidebar/SidebarClearSearchInput";

interface TeamsSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function TeamsSearchBar({ value, onChange }: TeamsSearchBarProps) {
  return (
    <SidebarClearSearchInput
      value={value}
      onChange={onChange}
      placeholder="Search teams"
      aria-label="Search teams"
    />
  );
}
