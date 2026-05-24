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
  className?: string;
}

export function WikiAddMenu({
  onCreateDocument,
  onCreateFolder,
  className,
}: WikiAddMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2", className)}>
          <IconPlus size={16} />
          Add
          <IconChevronDown size={14} className="text-muted-foreground" />
        </Button>
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
