// list view controls rendered in the page header

import { useState } from "react";
import { IconSortDescending } from "@tabler/icons-react";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@vvedantb/ui";
import AddMemoryIconTrigger from "@/components/memories/AddMemoryIconTrigger";
import HeaderSearchPopover from "./HeaderSearchPopover";
import { MemoryFiltersButton } from "@/routes/_main/$profileId/memories/_components/MemoryFiltersButton";
import { CLEARED_MEMORY_VIEW_FILTERS } from "@/lib/memory-view-filters";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useMemoryListFilterStats } from "@/hooks/useMemoryListFilterStats";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

export default function MemoryListHeaderControls({
  searchPlaceholder = "Search memories and skills...",
  searchLabel = "Search memories",
}: {
  searchPlaceholder?: string;
  searchLabel?: string;
}) {
  const [params, setParams] = useMemoriesSearchParams();
  // facets (tag/source/type counts) load on first open of the filter panel
  const [filtersOpened, setFiltersOpened] = useState(false);
  const {
    allMemories,
    allItems,
    distinctSources,
    filters,
    filteredCount,
    totalCount,
  } = useMemoryListFilterStats({ enabled: filtersOpened });
  const { isDark } = useThemeContext();

  return (
    <div className="flex items-center gap-1.5">
      <HeaderSearchPopover
        value={params.q}
        onChange={(q) => setParams({ q: q.trim().length === 0 ? null : q })}
        placeholder={searchPlaceholder}
        label={searchLabel}
        inputLabel="Search"
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
        onOpenChange={(open) => {
          if (open) setFiltersOpened(true);
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Sort by usefulness"
            aria-pressed={params.sort === "usefulness"}
            className={
              params.sort === "usefulness"
                ? "h-11 w-11 shrink-0 bg-surface-secondary md:h-8 md:w-8"
                : "h-11 w-11 shrink-0 md:h-8 md:w-8"
            }
            onClick={() =>
              setParams({
                sort: params.sort === "usefulness" ? null : "usefulness",
              })
            }
          >
            <IconSortDescending size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          Sort by usefulness (loaded memories)
        </TooltipContent>
      </Tooltip>
      <AddMemoryIconTrigger className="h-11 w-11 shrink-0 md:h-8 md:w-8" />
    </div>
  );
}
