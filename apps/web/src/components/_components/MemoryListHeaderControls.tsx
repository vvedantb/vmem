"use client";

/**
 * List-view controls rendered in the page header.
 *
 * Renders two popover buttons — Search and Filters. Mirrors the graph's
 * header pattern but with list-specific filter data (memories + wiki + skills
 * merged). Graph-only controls (Options, Legend) are intentionally omitted.
 */

import { useMemo } from "react";
import { useQueryStates } from "nuqs";
import { useQuery } from "convex/react";
import { IconFilter } from "@tabler/icons-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@vmem/ui";
import { api } from "@vmem/backend";
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

  const hasActiveFilters =
    params.profile !== null ||
    params.kinds.length > 0 ||
    params.tags.length > 0 ||
    params.sources.length > 0 ||
    params.types.length > 0;

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
            {hasActiveFilters && (
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-3">
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
    </div>
  );
}
