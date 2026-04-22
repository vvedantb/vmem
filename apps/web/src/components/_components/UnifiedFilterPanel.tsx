"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  TabsPrimitive,
} from "@vmem/ui";
import {
  IconArrowsSort,
  IconCategory,
  IconPlug,
  IconShape,
  IconTag,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { Virtuoso } from "react-virtuoso";
import { api } from "@vmem/backend";
import {
  buildTagStats,
  formatMemorySourceLabel,
  formatMemoryTypeLabel,
  MEMORY_TYPES,
  sortTagStats,
  type Memory,
  type MemoryType,
  type TagSortMode,
  type TagStats,
} from "@/lib/memories";
import {
  formatListItemKindLabel,
  LIST_ITEM_KINDS,
  type ListItem,
  type ListItemKind,
} from "@/lib/list-items";
import { nodeColor } from "./graph-colors";
import ShapeIndicator from "./ShapeIndicator";

const TAG_SORT_LABELS: Record<TagSortMode, string> = {
  "a-z": "A\u2013Z",
  "most-used": "Most used",
  "most-recent": "Most recent",
};

const TAG_SORT_OPTIONS: TagSortMode[] = ["a-z", "most-used", "most-recent"];

type FilterTab = "profile" | "kind" | "tags" | "source" | "type";

interface UnifiedFilterPanelProps {
  /** All memories for tag/source/type counts (list view) */
  allMemories?: Memory[];
  /** All items (memories + wiki + skills) for kind counts (list view) */
  allItems?: ListItem[];

  // Profile
  selectedProfileId: string | null;
  onProfileChange: (id: string | null) => void;

  // Kinds - supports both array (list) and Set (graph) styles
  selectedKinds?: ListItemKind[];
  onKindsChange?: (kinds: ListItemKind[]) => void;
  /** Graph-style kind counts - if provided, used instead of computing from allItems */
  kindCounts?: Record<ListItemKind, number>;

  // Tags - supports both array (list) and Set (graph) styles
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
  /** Graph-style tag stats - if provided, used instead of computing from allMemories */
  tagStats?: TagStats[];

  // Sources (list view only)
  distinctSources?: string[];
  selectedSources?: string[];
  onSourcesChange?: (sources: string[]) => void;

  // Types (list view only)
  selectedTypes?: MemoryType[];
  onTypesChange?: (types: MemoryType[]) => void;
  /** Graph-style type counts — if provided, used instead of computing from allMemories */
  typeCounts?: Record<MemoryType, number>;

  // Result count
  filteredCount: number;
  totalCount: number;

  /**
   * Reset every filter at once. Must be a single atomic update — clearing
   * filters one-by-one via the individual handlers races when those handlers
   * read from stale URL/closure state (see graph view's toggle-based adapters).
   */
  onClearAll: () => void;

  isDark: boolean;

  /**
   * Which tabs to show. Defaults to all 5. Kept configurable so embeddings
   * that only care about a subset (e.g. a dialog scoped to picking a tag)
   * can hide the rest.
   */
  visibleTabs?: FilterTab[];
}

/**
 * Unified filter panel content that consolidates Profile, Kind, Tags, Source,
 * and Type filters into vertical tabs. The caller wraps this inside their own
 * Popover — this component only renders the panel body.
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
  const profiles = useQuery(api.profiles.list);

  // Compute active counts per category
  const profileCount = selectedProfileId ? 1 : 0;
  const kindCount = selectedKinds.length;
  const tagCount = selectedTags.length;
  const sourceCount = selectedSources.length;
  const typeCount = selectedTypes.length;
  const totalActiveCount =
    profileCount + kindCount + tagCount + sourceCount + typeCount;

  const hasActiveFilters = totalActiveCount > 0;

  // Kind counts - use prop if provided, else compute from allItems
  const kindCounts = useMemo(() => {
    if (kindCountsProp) return kindCountsProp;
    const counts: Record<ListItemKind, number> = {
      memory: 0,
      "wiki-document": 0,
      "wiki-folder": 0,
      skill: 0,
    };
    for (const item of allItems) {
      counts[item.kind] += 1;
    }
    return counts;
  }, [kindCountsProp, allItems]);

  // Tag stats - use prop if provided, else compute and sort from allMemories
  const computedTags = useMemo(() => buildTagStats(allMemories), [allMemories]);
  const sortedTags = useMemo(() => {
    const tags = tagStatsProp ?? computedTags;
    return tagStatsProp ? tags : sortTagStats(tags, tagSortMode);
  }, [tagStatsProp, computedTags, tagSortMode]);

  // Type counts - use prop if provided (graph view), else compute from allMemories
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

  // Toggle helpers
  const toggleKind = (kind: ListItemKind) => {
    if (!onKindsChange) return;
    if (selectedKinds.includes(kind)) {
      onKindsChange(selectedKinds.filter((k) => k !== kind));
    } else {
      onKindsChange([...selectedKinds, kind]);
    }
  };

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

  const toggleSource = (source: string) => {
    if (!onSourcesChange) return;
    if (selectedSources.includes(source)) {
      onSourcesChange(selectedSources.filter((s) => s !== source));
    } else {
      onSourcesChange([...selectedSources, source]);
    }
  };

  const toggleType = (type: MemoryType) => {
    if (!onTypesChange) return;
    if (selectedTypes.includes(type)) {
      onTypesChange(selectedTypes.filter((t) => t !== type));
    } else {
      onTypesChange([...selectedTypes, type]);
    }
  };

  // Delegate to the caller so every filter resets in one atomic update. Calling
  // the individual on*Change handlers in sequence races in the graph view,
  // whose adapters iterate `activeKinds`/`activeTags` and call per-item toggles
  // — each toggle reads stale `params.*` from its closure, so only the last
  // update survives. A single batched write from the caller sidesteps that.
  const clearAll = () => onClearAll();

  // Tab badge helper
  const tabBadge = (count: number) =>
    count > 0 ? (
      <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium tabular-nums text-primary">
        {count}
      </span>
    ) : null;

  return (
    <div className="flex flex-col">
      <TabsPrimitive.Root defaultValue="profile" className="flex h-[320px]">
        {/* Left: Vertical tabs */}
        <TabsPrimitive.List
          className="flex flex-col justify-start h-full w-12 sm:w-32 shrink-0 border-r border-border p-1 gap-0.5"
          aria-orientation="vertical"
        >
          {visibleTabs.includes("profile") && (
            <TabsPrimitive.Trigger
              value="profile"
              aria-label="Profile"
              className="flex w-full items-center justify-center sm:justify-start gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground"
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
              className="flex w-full items-center justify-center sm:justify-start gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground"
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
              className="flex w-full items-center justify-center sm:justify-start gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground"
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
              className="flex w-full items-center justify-center sm:justify-start gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground"
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
              className="flex w-full items-center justify-center sm:justify-start gap-1.5 rounded-md px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 data-[state=active]:bg-muted data-[state=active]:text-foreground"
            >
              <IconCategory size={14} />
              <span className="hidden sm:inline">Type</span>
              {tabBadge(typeCount)}
            </TabsPrimitive.Trigger>
          )}
        </TabsPrimitive.List>

        {/* Right: Tab content */}
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          {/* Profile tab */}
          {visibleTabs.includes("profile") && (
            <TabsPrimitive.Content
              value="profile"
              className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="p-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => onProfileChange(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                    !selectedProfileId
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-muted/50",
                  )}
                >
                  <IconUsers size={14} />
                  All Profiles
                  <span className="ml-auto text-muted-foreground/50 tabular-nums">
                    {totalCount}
                  </span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto max-h-64">
                {profiles === undefined ? (
                  <div className="p-2 space-y-1">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : profiles.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground text-center">
                    No profiles found
                  </div>
                ) : (
                  profiles.map((profile) => {
                    const isSelected = selectedProfileId === profile._id;
                    return (
                      <button
                        key={profile._id}
                        type="button"
                        onClick={() => onProfileChange(profile._id)}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors border-b border-border/40 last:border-0",
                          isSelected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/50",
                        )}
                      >
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: profile.color }}
                        />
                        <span className="truncate">{profile.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </TabsPrimitive.Content>
          )}

          {/* Kind tab */}
          {visibleTabs.includes("kind") && (
            <TabsPrimitive.Content
              value="kind"
              className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="p-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => onKindsChange?.([])}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                    selectedKinds.length === 0
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-muted/50",
                  )}
                >
                  All kinds
                  <span className="ml-auto text-muted-foreground/50 tabular-nums">
                    {allItems.length}
                  </span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {LIST_ITEM_KINDS.map((kind) => {
                  const checked = selectedKinds.includes(kind);
                  const color = nodeColor([], kind, isDark, null);
                  return (
                    <label
                      key={kind}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/30"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleKind(kind)}
                      />
                      <ShapeIndicator kind={kind} color={color} />
                      <span className="flex-1 text-xs truncate">
                        {formatListItemKindLabel(kind)}
                      </span>
                      <span className="text-xs text-muted-foreground/50 tabular-nums">
                        {kindCounts[kind]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </TabsPrimitive.Content>
          )}

          {/* Tags tab */}
          {visibleTabs.includes("tags") && (
            <TabsPrimitive.Content
              value="tags"
              className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="p-2 border-b border-border">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onTagsChange?.([])}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                      selectedTags.length === 0
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-muted/50",
                    )}
                  >
                    All tags
                    <span className="text-muted-foreground/50 tabular-nums">
                      {allMemories.length}
                    </span>
                  </button>
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
                      {TAG_SORT_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option}
                          onClick={() => setTagSortMode(option)}
                          className={cn(
                            tagSortMode === option &&
                              "font-medium text-foreground",
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
                <div className="p-3 text-xs text-muted-foreground text-center">
                  No tags yet
                </div>
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
                        <label className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/30">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleTag(tagStat.tag)}
                          />
                          <span className="flex-1 text-xs truncate">
                            {tagStat.tag}
                          </span>
                          <span className="text-xs text-muted-foreground/50 tabular-nums">
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
          )}

          {/* Source tab */}
          {visibleTabs.includes("source") && (
            <TabsPrimitive.Content
              value="source"
              className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="p-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => onSourcesChange?.([])}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                    selectedSources.length === 0
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-muted/50",
                  )}
                >
                  All sources
                  <span className="ml-auto text-muted-foreground/50 tabular-nums">
                    {allMemories.length}
                  </span>
                </button>
              </div>
              {distinctSources.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">
                  No sources yet
                </div>
              ) : (
                <div className="flex-1 min-h-0">
                  <Virtuoso
                    data={distinctSources}
                    computeItemKey={(_index, item) => item}
                    fixedItemHeight={36}
                    itemContent={(_i, source) => {
                      const checked = selectedSources.includes(source);
                      return (
                        <label className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/30">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSource(source)}
                          />
                          <span className="flex-1 text-xs truncate">
                            {formatMemorySourceLabel(source)}
                          </span>
                        </label>
                      );
                    }}
                    style={{ height: "100%" }}
                  />
                </div>
              )}
            </TabsPrimitive.Content>
          )}

          {/* Type tab */}
          {visibleTabs.includes("type") && (
            <TabsPrimitive.Content
              value="type"
              className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="p-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => onTypesChange?.([])}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
                    selectedTypes.length === 0
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-muted/50",
                  )}
                >
                  All types
                  <span className="ml-auto text-muted-foreground/50 tabular-nums">
                    {allMemories.length}
                  </span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {MEMORY_TYPES.map((type) => {
                  const checked = selectedTypes.includes(type);
                  return (
                    <label
                      key={type}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-border/40 last:border-0 hover:bg-muted/30"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleType(type)}
                      />
                      <span className="flex-1 text-xs truncate">
                        {formatMemoryTypeLabel(type)}
                      </span>
                      <span className="text-xs text-muted-foreground/50 tabular-nums">
                        {typeCounts[type]}
                      </span>
                    </label>
                  );
                })}
              </div>
            </TabsPrimitive.Content>
          )}
        </div>
      </TabsPrimitive.Root>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          Showing {filteredCount} of {totalCount} items
        </span>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
