import type { MemoryViewFilterParams } from "@/lib/memory-view-filters";
import {
  listItemPassesFilters,
  memoryToListItem,
  type ListItem,
} from "@/lib/list-items";
import { useMemoryFacets } from "@/hooks/useMemoryFacets";
import { useMemoryListSupplementaryItems } from "@/hooks/useMemoryListSupplementaryItems";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

// `enabled` gates the (non-reactive) full-scope facet fetch: callers pass true
// once the filter panel is opened, so the page never pays for it up front.
export function useMemoryListFilterStats({ enabled }: { enabled: boolean }) {
  const [params] = useMemoriesSearchParams();
  const { memories: allMemories } = useMemoryFacets({ enabled });
  const supplementaryItems = useMemoryListSupplementaryItems();

  const filters: MemoryViewFilterParams = {
    kinds: params.kinds,
    tags: params.tags,
    sources: params.sources,
    types: params.types,
  };

  const memoryItems = allMemories.map(memoryToListItem);
  const allItems: ListItem[] = [...memoryItems, ...supplementaryItems];

  const sourceSet = new Set<string>();
  for (const memory of allMemories) sourceSet.add(memory.source);
  const distinctSources = Array.from(sourceSet).sort((a, b) =>
    a.localeCompare(b),
  );

  const filteredCount = allItems.filter((item) =>
    listItemPassesFilters(item, filters),
  ).length;

  const totalCount = allItems.length;

  return {
    allMemories,
    allItems,
    distinctSources,
    filters,
    filteredCount,
    totalCount,
  };
}
