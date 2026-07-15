import { IconCopy, IconDots, IconHistory } from "@tabler/icons-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Switch,
} from "@vmem/ui";

interface WikiDocActionsMenuProps {
  outlineVisible: boolean;
  onOutlineVisibleChange: (visible: boolean) => void;
  onShowHistory: () => void;
  wordCount: number;
  onCopy: () => void;
  copyDisabled?: boolean;
}

export function WikiDocActionsMenu({
  outlineVisible,
  onOutlineVisibleChange,
  onShowHistory,
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
          variant="secondary"
          size="sm"
          className="shrink-0 gap-1.5"
          aria-label="Document options"
          disabled={copyDisabled}
        >
          <IconDots size={16} />
          Options
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52 w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted tabular-nums">
          {wordCountLabel}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex items-center justify-between gap-4"
          onSelect={(e) => e.preventDefault()}
        >
          <span>View outline</span>
          <Switch
            checked={outlineVisible}
            onCheckedChange={onOutlineVisibleChange}
            aria-label="View outline"
            onClick={(e) => e.stopPropagation()}
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onShowHistory}>
          <IconHistory size={14} />
          Version history
        </DropdownMenuItem>
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
