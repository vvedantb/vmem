"use client";

import { IconSearch } from "@tabler/icons-react";
import { ClearInput } from "@vmem/ui";
import { sidebarSearchInputClassName } from "./sidebar-search-input";

interface SidebarClearSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  "aria-label": string;
}

export function SidebarClearSearchInput({
  value,
  onChange,
  placeholder,
  "aria-label": ariaLabel,
}: SidebarClearSearchInputProps) {
  return (
    <ClearInput
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={ariaLabel}
      wrapperClassName="mb-2"
      className={sidebarSearchInputClassName}
      leading={
        <IconSearch
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 z-[5] -translate-y-1/2 text-muted"
        />
      }
    />
  );
}
