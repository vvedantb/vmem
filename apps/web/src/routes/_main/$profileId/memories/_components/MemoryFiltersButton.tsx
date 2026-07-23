import { IconFilter } from "@tabler/icons-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@vmem/ui";
import { FacetedFilterBadge } from "@/components/_components/FacetedFilter";
import UnifiedFilterPanel from "@/components/_components/UnifiedFilterPanel";
import type { Memory, MemoryType, TagStats } from "@/lib/memories";
import type { ListItem, ListItemKind } from "@/lib/list-items";
import {
  countActiveMemoryViewFilters,
  type MemoryViewFilterParams,
} from "@/lib/memory-view-filters";

interface MemoryFiltersButtonProps {
  filters: MemoryViewFilterParams;
  onKindsChange: (kinds: ListItemKind[]) => void;
  onTagsChange: (tags: string[]) => void;
  onSourcesChange: (sources: string[]) => void;
  onTypesChange: (types: MemoryType[]) => void;
  onClearAll: () => void;
  filteredCount: number;
  totalCount: number;
  isDark: boolean;
  ariaLabel: string;
  allMemories?: Memory[];
  allItems?: ListItem[];
  kindCounts?: Record<ListItemKind, number>;
  tagStats?: TagStats[];
  distinctSources?: string[];
  typeCounts?: Record<MemoryType, number>;
}

export function MemoryFiltersButton({
  filters,
  onKindsChange,
  onTagsChange,
  onSourcesChange,
  onTypesChange,
  onClearAll,
  filteredCount,
  totalCount,
  isDark,
  ariaLabel,
  allMemories,
  allItems,
  kindCounts,
  tagStats,
  distinctSources,
  typeCounts,
}: MemoryFiltersButtonProps) {
  const activeFilterCount = countActiveMemoryViewFilters(filters);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={ariaLabel}
          className="relative"
        >
          <IconFilter size={16} />
          <FacetedFilterBadge count={activeFilterCount} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[calc(100vw-1rem)] max-w-[420px] p-0 sm:w-[420px]"
      >
        <UnifiedFilterPanel
          allMemories={allMemories}
          allItems={allItems}
          selectedKinds={[...filters.kinds]}
          onKindsChange={onKindsChange}
          kindCounts={kindCounts}
          selectedTags={[...filters.tags]}
          onTagsChange={onTagsChange}
          tagStats={tagStats}
          distinctSources={distinctSources}
          selectedSources={[...filters.sources]}
          onSourcesChange={onSourcesChange}
          selectedTypes={[...filters.types]}
          onTypesChange={onTypesChange}
          typeCounts={typeCounts}
          filteredCount={filteredCount}
          totalCount={totalCount}
          onClearAll={onClearAll}
          isDark={isDark}
        />
      </PopoverContent>
    </Popover>
  );
}
