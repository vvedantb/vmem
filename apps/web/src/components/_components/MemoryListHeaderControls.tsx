"use client";

/**
 * List-view controls rendered in the page header.
 *
 * Renders View + Search + Filters popovers and the Add Memory trigger. The
 * View dropdown switches between the unified memory/wiki/skill list and the
 * tag-rows view (formerly the standalone /memories/tags route). Mirrors the
 * graph's header pattern but with list-specific filter data; graph-only
 * controls (graph Options, Legend) are intentionally omitted.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  IconCheck,
  IconChevronDown,
  IconHash,
  IconList,
  IconPlus,
} from "@tabler/icons-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import AddMemoryModal from "@/components/AddMemoryModal";
import HeaderSearchInput from "./HeaderSearchInput";
import { MemoryFiltersButton } from "@/routes/_main/$profileId/memories/_components/MemoryFiltersButton";
import {
  CLEARED_MEMORY_VIEW_FILTERS,
  type MemoryViewFilterParams,
} from "@/lib/memory-view-filters";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import type { ListViewMode } from "@/routes/_main/$profileId/memories/-searchParams";
import {
  listItemMatchesKindFilter,
  listItemMatchesSourceFilter,
  listItemMatchesTagFilter,
  listItemMatchesTypeFilter,
  memoryToListItem,
  skillRowsToListItems,
  wikiRowsToListItems,
  type ListItem,
} from "@/lib/list-items";
import { useMemoriesSearchParams } from "@/routes/_main/$profileId/memories/useMemoriesSearchParams";

export default function MemoryListHeaderControls() {
  const teamId = useActiveProfile().teamId;
  const [params, setParams] = useMemoriesSearchParams();
  const { memories: allMemories } = useMemoryContext();
  const wikiRows = useQuery(api.wiki.listTree, { teamId });
  const skillRows = useQuery(api.skills.listMy, { teamId });
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
          listItemMatchesTypeFilter(item, params.types)),
    );
  }, [allItems, params.kinds, params.tags, params.sources, params.types]);

  const filters = useMemo<MemoryViewFilterParams>(
    () => ({
      kinds: params.kinds,
      tags: params.tags,
      sources: params.sources,
      types: params.types,
    }),
    [params.kinds, params.tags, params.sources, params.types],
  );

  const isTagsView = params.view === "tags";

  return (
    <div className="flex items-center gap-1.5">
      <ViewDropdown
        view={params.view}
        onChange={(view) => setParams({ view })}
      />
      <HeaderSearchInput
        value={params.q}
        onChange={(q) => setParams({ q: q.trim().length === 0 ? null : q })}
        placeholder={
          isTagsView ? "Search tags..." : "Search memories, wiki, and skills..."
        }
        label="Search"
      />
      <MemoryFiltersButton
        filters={filters}
        onKindsChange={(kinds) => setParams({ kinds })}
        onTagsChange={(tags) => setParams({ tags })}
        onSourcesChange={(sources) => setParams({ sources })}
        onTypesChange={(types) => setParams({ types })}
        onClearAll={() => setParams(CLEARED_MEMORY_VIEW_FILTERS)}
        allMemories={allMemories}
        allItems={allItems}
        distinctSources={distinctSources}
        filteredCount={filteredItems.length}
        totalCount={allItems.length}
        isDark={isDark}
        ariaLabel="Filter list"
      />
      <AddMemoryModal
        trigger={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Add memory"
            className="h-11 w-11 shrink-0 md:h-8 md:w-8"
          >
            <IconPlus size={16} />
          </Button>
        }
      />
    </div>
  );
}

// ---- View dropdown ----
//
// Two options today (memories / tags) but kept as a dropdown rather than a
// segmented toggle so adding a third view later (e.g. sources) doesn't
// require a layout rethink. Per the project's UI rules: prefer dropdowns
// with explicit options over toggle buttons when a control has ≥2 states.

const VIEW_OPTIONS: {
  value: ListViewMode;
  label: string;
  Icon: typeof IconList;
}[] = [
  { value: "memories", label: "Memories", Icon: IconList },
  { value: "tags", label: "Tags", Icon: IconHash },
];

function ViewDropdown({
  view,
  onChange,
}: {
  view: ListViewMode;
  onChange: (next: ListViewMode) => void;
}) {
  const current =
    VIEW_OPTIONS.find((o) => o.value === view) ?? VIEW_OPTIONS.at(0);
  if (!current) return null;
  const CurrentIcon = current.Icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          aria-label={`Change view (current: ${current.label})`}
        >
          <CurrentIcon size={14} />
          <span className="hidden sm:inline">{current.label}</span>
          <IconChevronDown size={12} className="text-muted" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px]">
        {VIEW_OPTIONS.map(({ value, label, Icon }) => {
          const isActive = value === view;
          return (
            <DropdownMenuItem
              key={value}
              onSelect={() => onChange(value)}
              className="justify-between"
            >
              <span className="flex items-center gap-2">
                <Icon size={14} stroke={1.5} />
                {label}
              </span>
              {isActive && <IconCheck size={14} className="text-muted" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
