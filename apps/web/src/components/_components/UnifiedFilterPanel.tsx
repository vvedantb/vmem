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
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@vmem/ui";
import {
  IconArrowsSort,
  IconCategory,
  IconFilter,
  IconPlug,
  IconShape,
  IconTag,
  IconUser,
  IconUsers,
  IconX,
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

  // Result count
  filteredCount: number;
  totalCount: number;

  isDark: boolean;

  /**
   * Which tabs to show. Default is all 5 for list view.
   * Graph view passes ["profile", "kind", "tags"] since Source/Type are memory-only.
   */
  visibleTabs?: FilterTab[];
}

/**
 * Unified filter panel that consolidates Profile, Kind, Tags, Source, and Type
 * filters into a single popover with vertical tabs.
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
  filteredCount,
  totalCount,
  isDark,
  visibleTabs = ["profile", "kind", "tags", "source", "type"],
}: UnifiedFilterPanelProps) {
  const [open, setOpen] = useState(false);
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

  // Type counts
  const typeCounts = useMemo(() => {
    const counts: Record<MemoryType, number> = {
      profile: 0,
      episodic: 0,
      knowledge: 0,
    };
    for (const memory of allMemories) {
      counts[memory.type] += 1;
    }
    return counts;
  }, [allMemories]);

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

  const clearAll = () => {
    onProfileChange(null);
    onKindsChange?.([]);
    onTagsChange?.([]);
    onSourcesChange?.([]);
    onTypesChange?.([]);
  };

  // Tab badge helper
  const tabBadge = (count: number) =>
    count > 0 ? (
      <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium tabular-nums text-primary">
        {count}
      </span>
    ) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative group">
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-12 shrink-0 gap-1.5 px-3",
              hasActiveFilters && "border-primary text-primary",
            )}
          >
            <IconFilter size={18} stroke={1.5} />
            Filter
            {totalActiveCount > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0 text-[10px] font-medium tabular-nums">
                {totalActiveCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-muted border border-border text-muted-foreground hover:bg-destructive hover:text-destructive-foreground hover:border-destructive group-hover:flex transition-colors"
          >
            <IconX size={12} />
          </button>
        )}
      </div>
      <PopoverContent
        className="w-[420px] p-0 flex flex-col"
        align="start"
        sideOffset={8}
      >
        <Tabs defaultValue="profile" className="flex h-[320px]">
          {/* Left: Vertical tabs */}
          <TabsList className="flex flex-col justify-start h-full w-32 shrink-0 rounded-none border-r border-border bg-muted/30 p-1 gap-0.5">
            {visibleTabs.includes("profile") && (
              <TabsTrigger
                value="profile"
                className="w-full justify-start gap-1.5 px-2 py-2 text-xs data-[state=active]:bg-background"
              >
                <IconUser size={14} />
                Profile
                {tabBadge(profileCount)}
              </TabsTrigger>
            )}
            {visibleTabs.includes("kind") && (
              <TabsTrigger
                value="kind"
                className="w-full justify-start gap-1.5 px-2 py-2 text-xs data-[state=active]:bg-background"
              >
                <IconShape size={14} />
                Kind
                {tabBadge(kindCount)}
              </TabsTrigger>
            )}
            {visibleTabs.includes("tags") && (
              <TabsTrigger
                value="tags"
                className="w-full justify-start gap-1.5 px-2 py-2 text-xs data-[state=active]:bg-background"
              >
                <IconTag size={14} />
                Tags
                {tabBadge(tagCount)}
              </TabsTrigger>
            )}
            {visibleTabs.includes("source") && (
              <TabsTrigger
                value="source"
                className="w-full justify-start gap-1.5 px-2 py-2 text-xs data-[state=active]:bg-background"
              >
                <IconPlug size={14} />
                Source
                {tabBadge(sourceCount)}
              </TabsTrigger>
            )}
            {visibleTabs.includes("type") && (
              <TabsTrigger
                value="type"
                className="w-full justify-start gap-1.5 px-2 py-2 text-xs data-[state=active]:bg-background"
              >
                <IconCategory size={14} />
                Type
                {tabBadge(typeCount)}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Right: Tab content */}
          <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
            {/* Profile tab */}
            {visibleTabs.includes("profile") && (
              <TabsContent
                value="profile"
                className="flex-1 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
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
              </TabsContent>
            )}

            {/* Kind tab */}
            {visibleTabs.includes("kind") && (
              <TabsContent
                value="kind"
                className="flex-1 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
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
              </TabsContent>
            )}

            {/* Tags tab */}
            {visibleTabs.includes("tags") && (
              <TabsContent
                value="tags"
                className="flex-1 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
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
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[120px]"
                      >
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
              </TabsContent>
            )}

            {/* Source tab */}
            {visibleTabs.includes("source") && (
              <TabsContent
                value="source"
                className="flex-1 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
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
              </TabsContent>
            )}

            {/* Type tab */}
            {visibleTabs.includes("type") && (
              <TabsContent
                value="type"
                className="flex-1 m-0 flex flex-col overflow-hidden data-[state=inactive]:hidden"
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
              </TabsContent>
            )}
          </div>
        </Tabs>

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
      </PopoverContent>
    </Popover>
  );
}
