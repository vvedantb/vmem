"use client";

import { IconCopy, IconDots, IconListDetails } from "@tabler/icons-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@vmem/ui";

interface WikiDocActionsMenuProps {
  outlineVisible: boolean;
  onOutlineVisibleChange: (visible: boolean) => void;
  wordCount: number;
  onCopy: () => void;
  copyDisabled?: boolean;
}

export function WikiDocActionsMenu({
  outlineVisible,
  onOutlineVisibleChange,
  wordCount,
  onCopy,
  copyDisabled = false,
}: WikiDocActionsMenuProps) {
  const wordCountLabel = `${wordCount.toLocaleString()} ${wordCount === 1 ? "word" : "words"}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          aria-label="Document actions"
          disabled={copyDisabled}
        >
          <IconDots size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground tabular-nums">
          {wordCountLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={outlineVisible}
          onCheckedChange={onOutlineVisibleChange}
          onSelect={(e) => e.preventDefault()}
        >
          <IconListDetails size={14} />
          View outline
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            onCopy();
          }}
        >
          <IconCopy size={14} />
          Copy
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
