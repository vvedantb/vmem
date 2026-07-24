import type { MemoryViewFilterParams } from "@/lib/memory-view-filters";
import {
  listItemPassesFilters,
  memoryToListItem,
  type ListItem,
} from "@/lib/list-items";
import { useRecentMemories } from "@/hooks/useRecentMemories";
import { useMemoryListSupplementaryItems } from "@/hooks/useMemoryListSupplementaryItems";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

// filter dropdown counts and option sources for the memories list header
export function useMemoryListFilterStats() {
  const [params] = useMemoriesSearchParams();
  const { memories: allMemories } = useRecentMemories();
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
