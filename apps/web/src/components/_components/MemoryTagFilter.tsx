"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@vmem/ui";
import {
  IconArrowsSort,
  IconLayersIntersect,
  IconTag,
} from "@tabler/icons-react";
import { Virtuoso } from "react-virtuoso";
import {
  buildTagStats,
  memoryMatchesTagFilters,
  sortTagStats,
  type Memory,
  type TagSortMode,
} from "@/lib/memories";

const SORT_LABELS: Record<TagSortMode, string> = {
  "a-z": "A\u2013Z",
  "most-used": "Most used",
  "most-recent": "Most recent",
};

const SORT_OPTIONS: TagSortMode[] = ["a-z", "most-used", "most-recent"];

interface MemoryTagFilterProps {
  memories: Memory[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export default function MemoryTagFilter({
  memories,
  selectedTags,
  onTagsChange,
}: MemoryTagFilterProps) {
  const [open, setOpen] = useState(false);
  const [sortMode, setSortMode] = useState<TagSortMode>("most-used");

  const allTags = useMemo(() => buildTagStats(memories), [memories]);
  const sortedTags = useMemo(
    () => sortTagStats(allTags, sortMode),
    [allTags, sortMode],
  );

  const toggleTag = (tag: string) => {
    const isSelected = selectedTags.some(
      (t) => t.toLowerCase() === tag.toLowerCase(),
    );
    if (isSelected) {
      onTagsChange(
        selectedTags.filter((t) => t.toLowerCase() !== tag.toLowerCase()),
      );
    } else {
      onTagsChange([...selectedTags, tag]);
    }
  };

  const filteredCount = useMemo(() => {
    if (selectedTags.length === 0) {
      return memories.length;
    }
    return memories.filter((m) => memoryMatchesTagFilters(m, selectedTags))
      .length;
  }, [memories, selectedTags]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-12 shrink-0 gap-1.5 px-3",
            selectedTags.length > 0 && "border-primary text-primary",
          )}
        >
          <IconTag size={18} stroke={1.5} />
          Tags
          {selectedTags.length > 0 ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium tabular-nums">
              {selectedTags.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 flex flex-col max-h-[min(420px,70vh)]">
        <div className="flex flex-col gap-2 border-b border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTagsChange([])}
            className={cn(
              "justify-start gap-2 h-9 px-2 font-normal",
              selectedTags.length === 0 &&
                "bg-accent text-accent-foreground font-medium",
            )}
          >
            <IconLayersIntersect size={16} stroke={1.5} />
            <span className="truncate">All memories</span>
            <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums">
              {memories.length}
            </span>
          </Button>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-muted-foreground">Tag list</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-6 w-6 text-muted-foreground"
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
        </div>
        {sortedTags.length === 0 ? (
          <span className="px-3 py-2 text-xs text-muted-foreground">
            No tags yet
          </span>
        ) : (
          <Virtuoso
            data={sortedTags}
            computeItemKey={(_index, item) => item.tag}
            fixedItemHeight={36}
            itemContent={(_i, tagStat) => {
              const checked = selectedTags.some(
                (t) => t.toLowerCase() === tagStat.tag.toLowerCase(),
              );
              return (
                <label className="flex h-9 cursor-pointer items-center gap-2 border-b border-border/40 px-3 last:border-0">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleTag(tagStat.tag)}
                  />
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-xs font-normal">
                    <span className="truncate">{tagStat.tag}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground/50 tabular-nums">
                      {tagStat.count}
                    </span>
                  </span>
                </label>
              );
            }}
            style={{ height: 240 }}
          />
        )}
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {selectedTags.length === 0
            ? `Showing all ${memories.length} memories`
            : `Matching ${filteredCount} ${filteredCount === 1 ? "memory" : "memories"}`}
        </div>
      </PopoverContent>
    </Popover>
  );
}
