// list view controls rendered in the page header

import AddMemoryIconTrigger from "@/components/memories/AddMemoryIconTrigger";
import HeaderSearchInput from "./HeaderSearchInput";
import { MemoryFiltersButton } from "@/routes/_main/$profileId/memories/_components/MemoryFiltersButton";
import { CLEARED_MEMORY_VIEW_FILTERS } from "@/lib/memory-view-filters";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useMemoryListFilterStats } from "@/hooks/useMemoryListFilterStats";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

export default function MemoryListHeaderControls({
  searchPlaceholder = "Search memories, wiki, and skills...",
}: {
  searchPlaceholder?: string;
}) {
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

  return (
    <div className="flex items-center gap-1.5">
      <HeaderSearchInput
        value={params.q}
        onChange={(q) => setParams({ q: q.trim().length === 0 ? null : q })}
        placeholder={searchPlaceholder}
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
