"use client";

import { useMemo, useState } from "react";
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@vmem/ui";
import {
  IconLayersIntersect,
  IconTag,
  IconArrowsSort,
} from "@tabler/icons-react";
import {
  buildTagStats,
  sortTagStats,
  type Memory,
  type TagSortMode,
} from "@/lib/memories";

interface TagSidebarProps {
  memories: Memory[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

const SORT_LABELS: Record<TagSortMode, string> = {
  "a-z": "A–Z",
  "most-used": "Most used",
  "most-recent": "Most recent",
};

const SORT_OPTIONS: TagSortMode[] = ["a-z", "most-used", "most-recent"];

export default function TagSidebar({
  memories,
  selectedTag,
  onSelectTag,
}: TagSidebarProps) {
  const [sortMode, setSortMode] = useState<TagSortMode>("a-z");

  const allTags = useMemo(() => buildTagStats(memories), [memories]);
  const sortedTags = useMemo(
    () => sortTagStats(allTags, sortMode),
    [allTags, sortMode],
  );

  return (
    <nav className="flex flex-col gap-1 py-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSelectTag(null)}
        className={cn(
          "justify-start gap-2 h-8 px-2 font-normal",
          selectedTag === null &&
            "bg-accent text-accent-foreground font-medium",
        )}
      >
        <IconLayersIntersect size={16} stroke={1.5} />
        <span className="truncate">All Memories</span>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {memories.length}
        </span>
      </Button>

      <div className="my-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground px-2">Tags</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="h-5 w-5 text-muted-foreground"
            >
              <IconArrowsSort size={12} stroke={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[120px]">
            {SORT_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => setSortMode(option)}
                className={cn(
                  sortMode === option && "font-medium text-foreground",
                )}
              >
                {SORT_LABELS[option]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {sortedTags.map((tagStat) => (
        <Button
          key={tagStat.tag}
          variant="ghost"
          size="sm"
          onClick={() => onSelectTag(tagStat.tag)}
          className={cn(
            "justify-start gap-2 h-7 px-2 text-xs font-normal",
            selectedTag === tagStat.tag &&
              "bg-accent text-accent-foreground font-medium",
          )}
        >
          <IconTag size={14} stroke={1.5} className="flex-shrink-0" />
          <span className="truncate">{tagStat.tag}</span>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {tagStat.count}
          </span>
        </Button>
      ))}

      {sortedTags.length === 0 && (
        <span className="px-2 py-1 text-xs text-muted-foreground">
          No tags yet
        </span>
      )}
    </nav>
  );
}
