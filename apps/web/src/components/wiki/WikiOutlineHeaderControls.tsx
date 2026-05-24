"use client";

import { IconListDetails } from "@tabler/icons-react";
import { Label, Switch, cn } from "@vmem/ui";

interface WikiOutlineHeaderControlsProps {
  outlineVisible: boolean;
  onOutlineVisibleChange: (visible: boolean) => void;
  hasDoc: boolean;
  wordCount: number;
}

export function WikiOutlineHeaderControls({
  outlineVisible,
  onOutlineVisibleChange,
  hasDoc,
  wordCount,
}: WikiOutlineHeaderControlsProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <Switch
          id="wiki-view-outline-header"
          checked={outlineVisible}
          disabled={!hasDoc}
          onCheckedChange={onOutlineVisibleChange}
          aria-label="View outline"
        />
        <Label
          htmlFor="wiki-view-outline-header"
          className={cn(
            "cursor-pointer text-sm font-medium",
            hasDoc ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="hidden sm:inline">View outline</span>
          <IconListDetails size={16} className="sm:hidden" aria-hidden />
        </Label>
      </div>
      {hasDoc ? (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
        </span>
      ) : null}
    </div>
  );
}
