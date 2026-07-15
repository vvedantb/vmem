import type { ReactNode } from "react";
import { IconSearch } from "@tabler/icons-react";
import { ClearInput, cn } from "@vmem/ui";
import { sidebarSearchInputClassName } from "./sidebar-search-input";

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
          <ClearInput
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            aria-label={ariaLabel}
            wrapperClassName="mb-0"
            className={sidebarSearchInputClassName}
            leading={
              <IconSearch
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 z-[5] -translate-y-1/2 text-muted"
              />
            }
          />
        </div>
        {actions}
      </div>
    </div>
  );
}
