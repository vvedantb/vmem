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
import { useQueryStates } from "nuqs";
import { useQuery } from "convex/react";
import {
  IconCheck,
  IconChevronDown,
  IconFilter,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import AddMemoryModal from "@/components/AddMemoryModal";
import SearchPopover from "./SearchPopover";
import UnifiedFilterPanel from "./UnifiedFilterPanel";
import { useMemoryContext } from "@/components/contexts/MemoryContext";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import type { ListViewMode } from "@/routes/_main/memories/-searchParams";
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

  const isTagsView = params.view === "tags";

  return (
    <div className="flex items-center gap-1.5">
      <ViewDropdown
        view={params.view}
        onChange={(view) => setParams({ view })}
      />
      <SearchPopover
        value={params.q}
        onChange={(q) => setParams({ q })}
        placeholder={
          isTagsView ? "Search tags..." : "Search memories, wiki, and skills..."
        }
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
        <PopoverContent
          align="end"
          className="w-[calc(100vw-1rem)] max-w-[420px] p-0 sm:w-[420px]"
        >
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
            onClearAll={() =>
              setParams({
                profile: null,
                kinds: [],
                tags: [],
                sources: [],
                types: [],
              })
            }
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
  const current = VIEW_OPTIONS.find((o) => o.value === view) ?? VIEW_OPTIONS[0];
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
          <IconChevronDown size={12} className="text-muted-foreground" />
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
              {isActive && (
                <IconCheck size={14} className="text-muted-foreground" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
