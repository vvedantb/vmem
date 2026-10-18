import type { ReactNode } from "react";
import { IconSearch } from "@tabler/icons-react";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ClearInputAlt,
  cn,
} from "@vvedantb/ui";
import { FacetedFilterBadge } from "./FacetedFilter";

interface HeaderSearchPopoverProps {
  value: string;
  onChange: (value: string) => void;
  // trigger label; the field reuses it unless inputLabel is set
  label: string;
  inputLabel?: string;
  placeholder?: string;
  variant?: "outline" | "ghost";
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // extra popup content under the field (e.g. results)
  children?: ReactNode;
}

// icon-sm search trigger; the field lives in a popover and a badge marks an
// active query (same badge as the filters button)
export default function HeaderSearchPopover({
  value,
  onChange,
  label,
  inputLabel = label,
  placeholder = "Search...",
  variant = "outline",
  triggerClassName,
  open,
  onOpenChange,
  children,
}: HeaderSearchPopoverProps) {
  const active = value.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="icon-sm"
          aria-label={label}
          title={label}
          className={cn("relative shrink-0", triggerClassName)}
        >
          <IconSearch size={16} />
          <FacetedFilterBadge count={active ? 1 : 0} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="flex w-[calc(100vw-1rem)] max-w-72 flex-col gap-1.5 p-2 sm:w-72"
      >
        <ClearInputAlt
          leading={
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 shrink-0 text-muted-foreground"
            />
          }
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          aria-label={inputLabel}
          clearLabel="Clear search"
          enterKeyHint="search"
          wrapperClassName="relative w-full min-w-0"
          className="h-8 rounded-lg border-border bg-transparent pl-8 text-xs shadow-none placeholder:text-muted/70 hover:bg-default focus-visible:border-border focus-visible:bg-default focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        {children}
      </PopoverContent>
    </Popover>
  );
}
