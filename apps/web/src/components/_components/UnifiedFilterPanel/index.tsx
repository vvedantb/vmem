"use client";

import { useMemo, useState } from "react";
import { Button, TabsPrimitive } from "@vmem/ui";
import {
  IconCategory,
  IconPlug,
  IconShape,
  IconTag,
  IconUser,
} from "@tabler/icons-react";
import {
  buildTagStats,
  sortTagStats,
  type MemoryType,
  type TagSortMode,
} from "@/lib/memories";
import type { ListItemKind } from "@/lib/list-items";
import type { UnifiedFilterPanelProps } from "./types";
import ProfileTab from "./ProfileTab";
import KindTab from "./KindTab";
import TagsTab from "./TagsTab";
import SourceTab from "./SourceTab";
import TypeTab from "./TypeTab";

export type { UnifiedFilterPanelProps, FilterTab } from "./types";

/**
 * Unified filter panel content that consolidates Profile, Kind, Tags, Source,
 * and Type filters into vertical tabs. The caller wraps this inside their own
 * Popover - this component only renders the panel body.
 */
export default function UnifiedFilterPanel({
  allMemories = [],
  allItems = [],
  selectedProfileId,
  onProfileChange,
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
  visibleTabs = ["profile", "kind", "tags", "source", "type"],
}: UnifiedFilterPanelProps) {
  const [tagSortMode, setTagSortMode] = useState<TagSortMode>("most-used");

  const profileCount = selectedProfileId ? 1 : 0;
  const kindCount = selectedKinds.length;
  const tagCount = selectedTags.length;
  const sourceCount = selectedSources.length;
  const typeCount = selectedTypes.length;
  const totalActiveCount =
    profileCount + kindCount + tagCount + sourceCount + typeCount;
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
    "flex w-full items-center justify-center sm:justify-start gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-secondary/50 data-[state=active]:bg-surface-secondary data-[state=active]:text-foreground";

  return (
    <div className="flex flex-col">
      <TabsPrimitive.Root defaultValue="profile" className="flex h-[320px]">
        <TabsPrimitive.List
          className="flex flex-col justify-start h-full w-12 sm:w-32 shrink-0 border-r border-border p-1 gap-0.5"
          aria-orientation="vertical"
        >
          {visibleTabs.includes("profile") && (
            <TabsPrimitive.Trigger
              value="profile"
              aria-label="Profile"
              className={triggerClass}
            >
              <IconUser size={14} />
              <span className="hidden sm:inline">Profile</span>
              {tabBadge(profileCount)}
            </TabsPrimitive.Trigger>
          )}
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
          {visibleTabs.includes("profile") && (
            <ProfileTab
              selectedProfileId={selectedProfileId}
              onProfileChange={onProfileChange}
              totalCount={totalCount}
            />
          )}
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

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-xs text-muted">
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
