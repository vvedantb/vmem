"use client";

import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vmem/ui";
import { IconArrowsSort } from "@tabler/icons-react";
import type { TagSortMode, TagStats } from "@/lib/memories";
import { FilterCheckboxRow, VirtuosoFilterTab } from "./filter-primitives";
import { TAG_SORT_LABELS, TAG_SORT_OPTIONS } from "./types";

interface TagsCtx {
  selectedTags: string[];
  onTagsChange?: (tags: string[]) => void;
}

function renderTagRow(_i: number, tagStat: TagStats, ctx: TagsCtx) {
  const lower = tagStat.tag.toLowerCase();
  return (
    <FilterCheckboxRow
      checked={ctx.selectedTags.some((t) => t.toLowerCase() === lower)}
      onToggle={() => {
        if (ctx.onTagsChange == null) return;
        const selected = ctx.selectedTags;
        const isSelected = selected.some((t) => t.toLowerCase() === lower);
        ctx.onTagsChange(
          isSelected
            ? selected.filter((t) => t.toLowerCase() !== lower)
            : [...selected, tagStat.tag],
        );
      }}
      label={tagStat.tag}
      count={tagStat.count}
    />
  );
}

export default function TagsTab({
  sortedTags,
  selectedTags,
  onTagsChange,
  tagSortMode,
  onTagSortModeChange,
  totalCount,
}: {
  sortedTags: TagStats[];
  selectedTags: string[];
  onTagsChange?: (tags: string[]) => void;
  tagSortMode: TagSortMode;
  onTagSortModeChange: (mode: TagSortMode) => void;
  totalCount: number;
}) {
  return (
    <VirtuosoFilterTab
      value="tags"
      allLabel="All tags"
      totalCount={totalCount}
      isAllSelected={selectedTags.length === 0}
      onSelectAll={() => onTagsChange?.([])}
      trailing={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="text-muted">
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
      }
      items={sortedTags}
      emptyMessage="No tags yet"
      context={{ selectedTags, onTagsChange }}
      computeItemKey={(_i, item) => item.tag}
      itemContent={renderTagRow}
    />
  );
}
