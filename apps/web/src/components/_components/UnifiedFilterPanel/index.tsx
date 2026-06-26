"use client";

import { useMemo, useState } from "react";
import { Button, TabsPrimitive } from "@vmem/ui";
import {
  IconCategory,
  IconPlug,
  IconShape,
  IconTag,
} from "@tabler/icons-react";
import {
  buildTagStats,
  sortTagStats,
  type MemoryType,
  type TagSortMode,
} from "@/lib/memories";
import type { ListItemKind } from "@/lib/list-items";
import type { UnifiedFilterPanelProps } from "./types";
import KindTab from "./KindTab";
import TagsTab from "./TagsTab";
import SourceTab from "./SourceTab";
import TypeTab from "./TypeTab";

export type { UnifiedFilterPanelProps, FilterTab } from "./types";

/**
 * Unified filter panel content that consolidates Kind, Tags, Source, and
 * Type filters into vertical tabs. (Profile is no longer a filter — the
 * workspace route scopes memories.) The caller wraps this inside their own
 * Popover - this component only renders the panel body.
 */
export default function UnifiedFilterPanel({
  allMemories = [],
  allItems = [],
  selectedKinds = [],
  onKindsChange,
  kindCounts: kindCountsProp,
  selectedTags = [],
  onTagsChange,
  tagStats: tagStatsProp,
  distinctSources = [],
  selectedSources = [],
  onSourcesChange,
  selectedTypes = [],
  onTypesChange,
  typeCounts: typeCountsProp,
  filteredCount,
  totalCount,
  onClearAll,
  isDark,
  visibleTabs = ["kind", "tags", "source", "type"],
}: UnifiedFilterPanelProps) {
  const [tagSortMode, setTagSortMode] = useState<TagSortMode>("most-used");

  const kindCount = selectedKinds.length;
  const tagCount = selectedTags.length;
  const sourceCount = selectedSources.length;
  const typeCount = selectedTypes.length;
  const totalActiveCount = kindCount + tagCount + sourceCount + typeCount;
  const hasActiveFilters = totalActiveCount > 0;

  const kindCounts = useMemo(() => {
    if (kindCountsProp) return kindCountsProp;
    const counts: Record<ListItemKind, number> = {
      memory: 0,
      entity: 0,
      "wiki-document": 0,
      "wiki-folder": 0,
      skill: 0,
    };
    for (const item of allItems) {
      counts[item.kind] += 1;
    }
    return counts;
  }, [kindCountsProp, allItems]);

  const computedTags = useMemo(() => buildTagStats(allMemories), [allMemories]);
  const sortedTags = useMemo(() => {
    const tags = tagStatsProp ?? computedTags;
    return tagStatsProp ? tags : sortTagStats(tags, tagSortMode);
  }, [tagStatsProp, computedTags, tagSortMode]);

  const typeCounts = useMemo(() => {
    if (typeCountsProp) return typeCountsProp;
    const counts: Record<MemoryType, number> = {
      profile: 0,
      episodic: 0,
      knowledge: 0,
    };
    for (const memory of allMemories) {
      counts[memory.type] += 1;
    }
    return counts;
  }, [typeCountsProp, allMemories]);

  const tabBadge = (count: number) =>
    count > 0 ? (
      <span className="ml-1 rounded-full bg-accent/15 px-1.5 py-0 text-[10px] font-medium tabular-nums text-accent">
        {count}
      </span>
    ) : null;

  const triggerClass =
    "flex w-full items-center justify-center sm:justify-start gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-tertiary hover:text-foreground data-[state=active]:bg-surface-secondary data-[state=active]:text-foreground";

  return (
    <div className="flex flex-col">
      <TabsPrimitive.Root defaultValue="kind" className="flex h-[320px]">
        <TabsPrimitive.List
          className="flex flex-col justify-start h-full w-12 sm:w-32 shrink-0 border-r border-separator p-1 gap-0.5"
          aria-orientation="vertical"
        >
          {visibleTabs.includes("kind") && (
            <TabsPrimitive.Trigger
              value="kind"
              aria-label="Kind"
              className={triggerClass}
            >
              <IconShape size={14} />
              <span className="hidden sm:inline">Kind</span>
              {tabBadge(kindCount)}
            </TabsPrimitive.Trigger>
          )}
          {visibleTabs.includes("tags") && (
            <TabsPrimitive.Trigger
              value="tags"
              aria-label="Tags"
              className={triggerClass}
            >
              <IconTag size={14} />
              <span className="hidden sm:inline">Tags</span>
              {tabBadge(tagCount)}
            </TabsPrimitive.Trigger>
          )}
          {visibleTabs.includes("source") && (
            <TabsPrimitive.Trigger
              value="source"
              aria-label="Source"
              className={triggerClass}
            >
              <IconPlug size={14} />
              <span className="hidden sm:inline">Source</span>
              {tabBadge(sourceCount)}
            </TabsPrimitive.Trigger>
          )}
          {visibleTabs.includes("type") && (
            <TabsPrimitive.Trigger
              value="type"
              aria-label="Type"
              className={triggerClass}
            >
              <IconCategory size={14} />
              <span className="hidden sm:inline">Type</span>
              {tabBadge(typeCount)}
            </TabsPrimitive.Trigger>
          )}
        </TabsPrimitive.List>

        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {visibleTabs.includes("kind") && (
            <KindTab
              selectedKinds={selectedKinds}
              onKindsChange={onKindsChange}
              kindCounts={kindCounts}
              totalCount={allItems.length}
              isDark={isDark}
            />
          )}
          {visibleTabs.includes("tags") && (
            <TagsTab
              sortedTags={sortedTags}
              selectedTags={selectedTags}
              onTagsChange={onTagsChange}
              tagSortMode={tagSortMode}
              onTagSortModeChange={setTagSortMode}
              totalCount={allMemories.length}
            />
          )}
          {visibleTabs.includes("source") && (
            <SourceTab
              distinctSources={distinctSources}
              selectedSources={selectedSources}
              onSourcesChange={onSourcesChange}
              totalCount={allMemories.length}
            />
          )}
          {visibleTabs.includes("type") && (
            <TypeTab
              selectedTypes={selectedTypes}
              onTypesChange={onTypesChange}
              typeCounts={typeCounts}
              totalCount={allMemories.length}
            />
          )}
        </div>
      </TabsPrimitive.Root>

      <div className="flex items-center justify-between border-t border-separator px-3 py-2">
        <span className="text-xs text-muted tabular-nums">
          Showing {filteredCount} of {totalCount} items
        </span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-6 px-2 text-xs text-muted hover:text-foreground"
          >
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
