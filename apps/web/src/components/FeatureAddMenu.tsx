"use client";

import { IconChevronDown, IconPlus } from "@tabler/icons-react";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@vmem/ui";
import type { ReactNode } from "react";

interface FeatureAddMenuProps {
  children: ReactNode;
  // `toolbar` = icon-only for the sidebar chrome row; `labeled` = full Add button
  variant?: "toolbar" | "labeled";
  className?: string;
}

export function FeatureAddMenu({
  children,
  variant = "labeled",
  className,
}: FeatureAddMenuProps) {
  const isToolbar = variant === "toolbar";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isToolbar ? (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Add"
            className={cn("shrink-0", className)}
          >
            <IconPlus size={16} />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-2", className)}
          >
            <IconPlus size={16} />
            Add
            <IconChevronDown size={14} className="text-muted" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
