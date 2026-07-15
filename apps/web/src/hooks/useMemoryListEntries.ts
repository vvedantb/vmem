import { useMemo } from "react";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { useMemoryListFlat } from "@/hooks/useMemoryList";
import { useMemoryListSupplementaryItems } from "@/hooks/useMemoryListSupplementaryItems";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";
import type { MemoryViewFilterParams } from "@/lib/memory-view-filters";
import { kindPassesFilter } from "@/lib/memory-view-filters";
import {
  listItemPassesFilters,
  memoryToListItem,
  searchListItems,
  type ListItem,
} from "@/lib/list-items";
import { memoryFromApi } from "@/lib/memories";
import {
  relativeRelevanceScore,
  type MemoryTrace,
} from "@/components/_components/memory-trace";

export type MemoryListEntry = {
  item: ListItem;
  score: number | null;
  trace?: MemoryTrace;
};

function unscoredEntry(item: ListItem): MemoryListEntry {
  return { item, score: null };
}

function passesMultiSelectFilters(
  item: ListItem,
  types: readonly string[],
  sources: readonly string[],
): boolean {
  if (item.kind !== "memory") return true;
  if (types.length > 1 && !types.includes(item.type)) return false;
  if (sources.length > 1 && !sources.includes(item.source)) return false;
  return true;
}

export function useMemoryListEntries() {
  const activeProfile = useActiveProfile();
  const [params] = useMemoriesSearchParams();
  const supplementaryItems = useMemoryListSupplementaryItems();

  const filters = useMemo<MemoryViewFilterParams>(
    () => ({
      kinds: params.kinds,
      tags: params.tags,
      sources: params.sources,
      types: params.types,
    }),
    [params.kinds, params.tags, params.sources, params.types],
  );

  const normalizedQuery = params.q.trim();
  const primaryType = params.types.length > 0 ? params.types[0] : undefined;
  const primarySource =
    params.sources.length > 0 ? params.sources[0] : undefined;
  const kindIncludesMemory =
    params.kinds.length === 0 || params.kinds.includes("memory");
  const isHybridSearch = normalizedQuery.length > 0 && kindIncludesMemory;
  const isShowingSearchResults = normalizedQuery.length > 0;

  const memoryPage = useMemoryListFlat({
    profileId: activeProfile._id,
    type: primaryType,
    source: primarySource,
    tags: params.tags,
    searchQuery: isHybridSearch ? undefined : normalizedQuery || undefined,
    enabled: !isHybridSearch,
  });

  const retrieveMemoriesAction = useAction(api.memoryApi.retrieveMemories);
  const retrieveQuery = useQuery({
    queryKey: [
      "retrieveMemories",
      activeProfile._id,
      normalizedQuery,
      primaryType,
      params.tags,
    ],
    enabled: isHybridSearch,
    queryFn: async () =>
      retrieveMemoriesAction({
        query: normalizedQuery,
        profileId: activeProfile._id,
        type: primaryType,
        tags: params.tags.length > 0 ? params.tags : undefined,
        limit: 25,
      }),
  });

  const memoryResults = isHybridSearch
    ? (retrieveQuery.data?.memories.map(memoryFromApi) ?? [])
    : memoryPage.memories;

  const displayItems = useMemo<MemoryListEntry[]>(() => {
    const memories = kindIncludesMemory
      ? memoryResults
          .map(memoryToListItem)
          .filter(
            (item) =>
              passesMultiSelectFilters(item, params.types, params.sources) &&
              kindPassesFilter(item.kind, params.kinds),
          )
      : [];

    const nonMemory = supplementaryItems.filter((item) =>
      listItemPassesFilters(item, filters),
    );

    const traceById = new Map<string, MemoryTrace>();
    let maxScore = 1;
    if (isHybridSearch && retrieveQuery.data) {
      let max = 0;
      for (const candidate of retrieveQuery.data.memories) {
        traceById.set(candidate.id, candidate.trace);
        if (candidate.trace.score > max) max = candidate.trace.score;
      }
      maxScore = max > 0 ? max : 1;
    }

    const memoryEntries: MemoryListEntry[] = memories.map((item) => {
      const trace = traceById.get(item.id);
      if (!trace) return unscoredEntry(item);
      return {
        item,
        score: relativeRelevanceScore(trace.score, maxScore),
        trace,
      };
    });

    if (!isShowingSearchResults) {
      return [...memoryEntries, ...nonMemory.map(unscoredEntry)];
    }

    return [
      ...memoryEntries,
      ...searchListItems(nonMemory, normalizedQuery).map((r) => ({
        item: r.item,
        score: r.relevanceScore,
      })),
    ];
  }, [
    memoryResults,
    supplementaryItems,
    filters,
    params.kinds,
    params.types,
    params.sources,
    kindIncludesMemory,
    isHybridSearch,
    isShowingSearchResults,
    normalizedQuery,
    retrieveQuery.data,
  ]);

  const isMemoriesLoading = isHybridSearch
    ? retrieveQuery.isLoading
    : memoryPage.isLoading;
  const isMemoriesError = isHybridSearch
    ? retrieveQuery.isError
    : memoryPage.isError;
  const refetchMemories = isHybridSearch
    ? retrieveQuery.refetch
    : memoryPage.refetch;

  return {
    activeProfileId: activeProfile._id,
    displayItems,
    memoryResults,
    isHybridSearch,
    isShowingSearchResults,
    isMemoriesLoading,
    isMemoriesError,
    refetchMemories,
    hasNextPage: memoryPage.hasNextPage,
    fetchNextPage: memoryPage.fetchNextPage,
    isFetchingNextPage: memoryPage.isFetchingNextPage,
  };
}
