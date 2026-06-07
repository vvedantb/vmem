"use client";

import { SidebarClearSearchInput } from "@/components/sidebar/SidebarClearSearchInput";

interface SkillsSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SkillsSearchBar({ value, onChange }: SkillsSearchBarProps) {
  return (
    <SidebarClearSearchInput
      value={value}
      onChange={onChange}
      placeholder="Search skills"
      aria-label="Search skills"
    />
  );
}
