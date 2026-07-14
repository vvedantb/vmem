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

const FILTER_TAB_TRIGGER_CLASS =
  "flex w-full items-center justify-center sm:justify-start gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-tertiary hover:text-foreground data-[state=active]:bg-surface-secondary data-[state=active]:text-foreground";

function filterTabBadge(count: number) {
  return count > 0 ? (
    <span className="ml-1 rounded-full bg-accent/15 px-1.5 py-0 text-[10px] font-medium tabular-nums text-accent">
      {count}
    </span>
  ) : null;
}

// unified filter panel content that consolidates Kind, Tags, Source, and Type filters
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
  const visibleTabSet = useMemo(() => new Set(visibleTabs), [visibleTabs]);

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
      "wiki-artifact": 0,
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

  return (
    <div className="flex flex-col">
      <TabsPrimitive.Root defaultValue="kind" className="flex h-[320px]">
        <TabsPrimitive.List
          className="flex flex-col justify-start h-full w-12 sm:w-32 shrink-0 border-r border-separator p-1 gap-0.5"
          aria-orientation="vertical"
        >
          {visibleTabSet.has("kind") ? (
            <TabsPrimitive.Trigger
              value="kind"
              aria-label="Kind"
              className={FILTER_TAB_TRIGGER_CLASS}
            >
              <IconShape size={14} />
              <span className="hidden sm:inline">Kind</span>
              {filterTabBadge(kindCount)}
            </TabsPrimitive.Trigger>
          ) : null}
          {visibleTabSet.has("tags") ? (
            <TabsPrimitive.Trigger
              value="tags"
              aria-label="Tags"
              className={FILTER_TAB_TRIGGER_CLASS}
            >
              <IconTag size={14} />
              <span className="hidden sm:inline">Tags</span>
              {filterTabBadge(tagCount)}
            </TabsPrimitive.Trigger>
          ) : null}
          {visibleTabSet.has("source") ? (
            <TabsPrimitive.Trigger
              value="source"
              aria-label="Source"
              className={FILTER_TAB_TRIGGER_CLASS}
            >
              <IconPlug size={14} />
              <span className="hidden sm:inline">Source</span>
              {filterTabBadge(sourceCount)}
            </TabsPrimitive.Trigger>
          ) : null}
          {visibleTabSet.has("type") ? (
            <TabsPrimitive.Trigger
              value="type"
              aria-label="Type"
              className={FILTER_TAB_TRIGGER_CLASS}
            >
              <IconCategory size={14} />
              <span className="hidden sm:inline">Type</span>
              {filterTabBadge(typeCount)}
            </TabsPrimitive.Trigger>
          ) : null}
        </TabsPrimitive.List>

        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {visibleTabSet.has("kind") ? (
            <KindTab
              selectedKinds={selectedKinds}
              onKindsChange={onKindsChange}
              kindCounts={kindCounts}
              totalCount={allItems.length}
              isDark={isDark}
            />
          ) : null}
          {visibleTabSet.has("tags") ? (
            <TagsTab
              sortedTags={sortedTags}
              selectedTags={selectedTags}
              onTagsChange={onTagsChange}
              tagSortMode={tagSortMode}
              onTagSortModeChange={setTagSortMode}
              totalCount={allMemories.length}
            />
          ) : null}
          {visibleTabSet.has("source") ? (
            <SourceTab
              distinctSources={distinctSources}
              selectedSources={selectedSources}
              onSourcesChange={onSourcesChange}
              totalCount={allMemories.length}
            />
          ) : null}
          {visibleTabSet.has("type") ? (
            <TypeTab
              selectedTypes={selectedTypes}
              onTypesChange={onTypesChange}
              typeCounts={typeCounts}
              totalCount={allMemories.length}
            />
          ) : null}
        </div>
      </TabsPrimitive.Root>

      <div className="flex items-center justify-between border-t border-separator px-3 py-2">
        <span className="text-xs text-muted tabular-nums">
          Showing {filteredCount} of {totalCount} items
        </span>
        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-6 px-2 text-xs text-muted hover:text-foreground"
          >
            Clear all
          </Button>
        ) : null}
      </div>
    </div>
  );
}
