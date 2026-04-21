"use client";

/**
 * List-view controls rendered in the page header.
 *
 * Renders Search + Filters popovers and the Add Memory trigger. Mirrors the
 * graph's header pattern but with list-specific filter data (memories + wiki
 * + skills merged). Graph-only controls (Options, Legend) are intentionally
 * omitted.
 */

import { useMemo } from "react";
import { useQueryStates } from "nuqs";
import { useQuery } from "convex/react";
import { IconFilter, IconPlus } from "@tabler/icons-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@vmem/ui";
import { api } from "@vmem/backend";
import AddMemoryModal from "@/components/AddMemoryModal";
import SearchPopover from "./SearchPopover";
import UnifiedFilterPanel from "./UnifiedFilterPanel";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import {
  listItemMatchesKindFilter,
  listItemMatchesProfileFilter,
  listItemMatchesSourceFilter,
  listItemMatchesTagFilter,
  listItemMatchesTypeFilter,
  memoryToListItem,
  skillRowsToListItems,
  wikiRowsToListItems,
  type ListItem,
} from "@/lib/list-items";
import { memoriesSearchParams } from "@/routes/_main/memories/-searchParams";

export default function MemoryListHeaderControls() {
  const [params, setParams] = useQueryStates(memoriesSearchParams);
  const { memories: allMemories } = useMemoryContext();
  const wikiRows = useQuery(api.wiki.listTree);
  const skillRows = useQuery(api.skills.listMy);
  const { theme } = useThemeContext();
  const isDark = theme === "dark";

  const allItems = useMemo<ListItem[]>(() => {
    const memoryItems = allMemories.map(memoryToListItem);
    const wikiItems = wikiRows ? wikiRowsToListItems(wikiRows) : [];
    const skillItems = skillRows ? skillRowsToListItems(skillRows) : [];
    return [...memoryItems, ...wikiItems, ...skillItems];
  }, [allMemories, wikiRows, skillRows]);

  const distinctSources = useMemo(() => {
    const set = new Set<string>();
    for (const m of allMemories) set.add(m.source);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allMemories]);

  const filteredItems = useMemo(() => {
    return allItems.filter(
      (item) =>
        listItemMatchesKindFilter(item, params.kinds) &&
        listItemMatchesTagFilter(item, params.tags) &&
        (params.sources.length === 0 ||
          listItemMatchesSourceFilter(item, params.sources)) &&
        (params.types.length === 0 ||
          listItemMatchesTypeFilter(item, params.types)) &&
        listItemMatchesProfileFilter(item, params.profile),
    );
  }, [
    allItems,
    params.kinds,
    params.tags,
    params.sources,
    params.types,
    params.profile,
  ]);

  const activeFilterCount =
    (params.profile !== null ? 1 : 0) +
    params.kinds.length +
    params.tags.length +
    params.sources.length +
    params.types.length;

  return (
    <div className="flex items-center gap-1.5">
      <SearchPopover
        value={params.q}
        onChange={(q) => setParams({ q })}
        placeholder="Search memories, wiki, and skills..."
        label="Search"
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Filter list"
            className="relative"
          >
            <IconFilter size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-medium tabular-nums text-primary-foreground flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[420px] p-0">
          <UnifiedFilterPanel
            allMemories={allMemories}
            allItems={allItems}
            selectedProfileId={params.profile}
            onProfileChange={(profile) => setParams({ profile })}
            selectedKinds={params.kinds}
            onKindsChange={(kinds) => setParams({ kinds })}
            selectedTags={params.tags}
            onTagsChange={(tags) => setParams({ tags })}
            distinctSources={distinctSources}
            selectedSources={params.sources}
            onSourcesChange={(sources) => setParams({ sources })}
            selectedTypes={params.types}
            onTypesChange={(types) => setParams({ types })}
            filteredCount={filteredItems.length}
            totalCount={allItems.length}
            isDark={isDark}
          />
        </PopoverContent>
      </Popover>
      <AddMemoryModal
        trigger={
          <Button variant="outline" size="icon-sm" aria-label="Add memory">
            <IconPlus size={16} />
          </Button>
        }
      />
    </div>
  );
}
