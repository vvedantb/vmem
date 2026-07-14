"use client";

import {
  IconChevronDown,
  IconFileText,
  IconFolderPlus,
  IconPlus,
} from "@tabler/icons-react";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vmem/ui";

interface WikiAddMenuProps {
  onCreateDocument: () => void;
  onCreateFolder: () => void;
  // `toolbar` = icon-only for the sidebar chrome row; `labeled` = full Add button
  variant?: "toolbar" | "labeled";
  className?: string;
}

export function WikiAddMenu({
  onCreateDocument,
  onCreateFolder,
  variant = "labeled",
  className,
}: WikiAddMenuProps) {
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
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onCreateDocument}>
          <IconFileText size={16} />
          New document
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCreateFolder}>
          <IconFolderPlus size={16} />
          New folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
