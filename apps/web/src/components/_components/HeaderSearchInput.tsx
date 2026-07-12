"use client";

import { IconSearch, IconX } from "@tabler/icons-react";
import { Button, Input, cn } from "@vmem/ui";

interface HeaderSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

/**
 * Always-visible toolbar search. Plain input — no ClearInput dissolve layers.
 */
export default function HeaderSearchInput({
  value,
  onChange,
  placeholder = "Search...",
  label = "Search",
  className,
}: HeaderSearchInputProps) {
  const active = value.trim().length > 0;

  return (
    <div className={cn("relative min-w-0 flex-1 sm:flex-none", className)}>
      <IconSearch
        size={14}
        className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2 text-muted"
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          "h-8 w-full min-w-0 border border-border bg-surface-secondary pl-8 text-xs shadow-none sm:w-44 md:w-52",
          "placeholder:text-muted/70",
          "focus-visible:border-focus-border focus-visible:bg-surface-tertiary focus-visible:ring-2 focus-visible:ring-focus-ring",
          active && "border-foreground/20 bg-surface-tertiary/90 pr-8",
        )}
      />
      {active ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          className="absolute right-0.5 top-1/2 z-[1] h-7 w-7 -translate-y-1/2 text-muted hover:text-foreground"
          onClick={() => onChange("")}
        >
          <IconX size={14} stroke={1.75} />
        </Button>
      ) : null}
    </div>
  );
}
