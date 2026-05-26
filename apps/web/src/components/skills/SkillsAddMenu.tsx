"use client";

import {
  IconChevronDown,
  IconPencil,
  IconPlus,
  IconUpload,
} from "@tabler/icons-react";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vmem/ui";

interface SkillsAddMenuProps {
  onWriteSkill: () => void;
  onUploadSkill: () => void;
  className?: string;
}

export function SkillsAddMenu({
  onWriteSkill,
  onUploadSkill,
  className,
}: SkillsAddMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2", className)}>
          <IconPlus size={16} />
          Add
          <IconChevronDown size={14} className="text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onWriteSkill}>
          <IconPencil size={16} />
          Write skill
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onUploadSkill}>
          <IconUpload size={16} />
          Upload skill
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
