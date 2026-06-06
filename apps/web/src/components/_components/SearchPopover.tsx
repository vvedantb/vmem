"use client";

import { IconSearch } from "@tabler/icons-react";
import {
  Button,
  ClearInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@vmem/ui";

interface SearchPopoverProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}

export default function SearchPopover({
  value,
  onChange,
  placeholder = "Search nodes...",
  label = "Search",
}: SearchPopoverProps) {
  const active = value.trim().length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={label}
          className="relative"
        >
          <IconSearch size={16} />
          {active && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-surface-tertiary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <ClearInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoFocus
          className="h-8 pl-8 text-xs bg-field-background"
          leading={
            <IconSearch
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 z-[5] -translate-y-1/2 text-muted"
            />
          }
        />
      </PopoverContent>
    </Popover>
  );
}
