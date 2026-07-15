"use client";

// list-view controls rendered in the page header

import {
  IconCheck,
  IconChevronDown,
  IconHash,
  IconList,
} from "@tabler/icons-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@vmem/ui";
import AddMemoryIconTrigger from "@/components/AddMemoryIconTrigger";
import HeaderSearchInput from "./HeaderSearchInput";
import { MemoryFiltersButton } from "@/routes/_main/$profileId/memories/_components/MemoryFiltersButton";
import { CLEARED_MEMORY_VIEW_FILTERS } from "@/lib/memory-view-filters";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import type { ListViewMode } from "@/lib/url-state/memories";
import { useMemoryListFilterStats } from "@/hooks/useMemoryListFilterStats";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

export default function MemoryListHeaderControls() {
  const [params, setParams] = useMemoriesSearchParams();
  const {
    allMemories,
    allItems,
    distinctSources,
    filters,
    filteredCount,
    totalCount,
  } = useMemoryListFilterStats();
  const { isDark } = useThemeContext();

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
        filteredCount={filteredCount}
        totalCount={totalCount}
        isDark={isDark}
        ariaLabel="Filter list"
      />
      <AddMemoryIconTrigger className="h-11 w-11 shrink-0 md:h-8 md:w-8" />
    </div>
  );
}

// two options today (memories / tags) but kept as a dropdown rather than a segmented

const VIEW_OPTIONS: {
  value: ListViewMode;
  label: string;
  Icon: typeof IconList;
}[] = [
  { value: "memories", label: "Memories", Icon: IconList },
  { value: "tags", label: "Tags", Icon: IconHash },
];

const VIEW_BY_VALUE = new Map(
  VIEW_OPTIONS.map((option) => [option.value, option]),
);

function ViewDropdown({
  view,
  onChange,
}: {
  view: ListViewMode;
  onChange: (next: ListViewMode) => void;
}) {
  const current = VIEW_BY_VALUE.get(view) ?? VIEW_OPTIONS.at(0);
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
              {isActive ? <IconCheck size={14} className="text-muted" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
