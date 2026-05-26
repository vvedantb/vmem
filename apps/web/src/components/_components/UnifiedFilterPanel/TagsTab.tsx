"use client";

import {
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TabsPrimitive,
} from "@vmem/ui";
import { IconArrowsSort } from "@tabler/icons-react";
import { Virtuoso } from "react-virtuoso";
import type { TagSortMode, TagStats } from "@/lib/memories";
import { TAG_SORT_LABELS, TAG_SORT_OPTIONS } from "./types";

interface TagsTabProps {
  sortedTags: TagStats[];
  selectedTags: string[];
  onTagsChange?: (tags: string[]) => void;
  tagSortMode: TagSortMode;
  onTagSortModeChange: (mode: TagSortMode) => void;
  totalCount: number;
}

export default function TagsTab({
  sortedTags,
  selectedTags,
  onTagsChange,
  tagSortMode,
  onTagSortModeChange,
  totalCount,
}: TagsTabProps) {
  const toggleTag = (tag: string) => {
    if (!onTagsChange) return;
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

  return (
    <TabsPrimitive.Content
      value="tags"
      className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
    >
      <div className="p-2 border-b border-separator">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onTagsChange?.([])}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
              selectedTags.length === 0
                ? "bg-surface text-foreground font-medium"
                : "hover:bg-surface-secondary/50",
            )}
          >
            All tags
            <span className="text-muted/50 tabular-nums">{totalCount}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="h-6 w-6 text-muted"
              >
                <IconArrowsSort size={12} stroke={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[120px]">
              {TAG_SORT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => onTagSortModeChange(option)}
                  className={cn(
                    tagSortMode === option && "font-medium text-foreground",
                  )}
                >
                  {TAG_SORT_LABELS[option]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {sortedTags.length === 0 ? (
        <div className="p-3 text-xs text-muted text-center">No tags yet</div>
      ) : (
        <div className="flex-1 min-h-0">
          <Virtuoso
            data={sortedTags}
            computeItemKey={(_index, item) => item.tag}
            fixedItemHeight={36}
            itemContent={(_i, tagStat) => {
              const checked = selectedTags.some(
                (t) => t.toLowerCase() === tagStat.tag.toLowerCase(),
              );
              return (
                <label className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-separator last:border-0 hover:bg-surface-secondary/30">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleTag(tagStat.tag)}
                  />
                  <span className="flex-1 text-xs truncate">{tagStat.tag}</span>
                  <span className="text-xs text-muted/50 tabular-nums">
                    {tagStat.count}
                  </span>
                </label>
              );
            }}
            style={{ height: "100%" }}
          />
        </div>
      )}
    </TabsPrimitive.Content>
  );
}
