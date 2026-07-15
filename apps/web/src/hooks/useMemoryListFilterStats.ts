"use client";

import { useMemo } from "react";
import type { MemoryViewFilterParams } from "@/lib/memory-view-filters";
import {
  listItemPassesFilters,
  memoryToListItem,
  type ListItem,
} from "@/lib/list-items";
import { useRecentMemories } from "@/hooks/useRecentMemories";
import { useMemoryListSupplementaryItems } from "@/hooks/useMemoryListSupplementaryItems";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

/** Filter dropdown counts and option sources for the memories list header. */
export function useMemoryListFilterStats() {
  const [params] = useMemoriesSearchParams();
  const { memories: allMemories } = useRecentMemories();
  const { supplementaryItems } = useMemoryListSupplementaryItems();

  const allItems = useMemo<ListItem[]>(() => {
    const memoryItems = allMemories.map(memoryToListItem);
    return [...memoryItems, ...supplementaryItems];
  }, [allMemories, supplementaryItems]);

  const distinctSources = useMemo(() => {
    const set = new Set<string>();
    for (const memory of allMemories) set.add(memory.source);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allMemories]);

  const filters = useMemo<MemoryViewFilterParams>(
    () => ({
      kinds: params.kinds,
      tags: params.tags,
      sources: params.sources,
      types: params.types,
    }),
    [params.kinds, params.tags, params.sources, params.types],
  );

  const filteredItems = useMemo(
    () => allItems.filter((item) => listItemPassesFilters(item, filters)),
    [allItems, filters],
  );

  return {
    allMemories,
    allItems,
    distinctSources,
    filters,
    filteredItems,
    filteredCount: filteredItems.length,
    totalCount: allItems.length,
  };
}
