import { useMemo } from "react";
import { useConvexAuth, useAction } from "convex/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  memoryFromApi,
  type Memory,
  type MemoryListResult,
} from "@/lib/memories";
import { api } from "@vmem/backend";

const MEMORY_LIST_PAGE_SIZE = 100;

/** Filters forwarded to the server-paginated listMemories action. */
export interface MemoryListFilters {
  profileId?: string | null;
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  /** When false, skips the paginated list query (e.g. hybrid retrieve). */
  enabled?: boolean;
}

function useMemoryListPage(filters: MemoryListFilters) {
  const { isAuthenticated } = useConvexAuth();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);

  // normalise so equivalent filter shapes produce the same cache key
  // arrays are defensively copied + sorted, strings are trimmed
  const normalizedFilters = useMemo<MemoryListFilters>(() => {
    const normalized: MemoryListFilters = {};
    if (filters.profileId !== undefined && filters.profileId !== null) {
      normalized.profileId = filters.profileId;
    }
    if (filters.type) normalized.type = filters.type;
    if (filters.status) normalized.status = filters.status;
    if (filters.source) normalized.source = filters.source;
    if (filters.tags && filters.tags.length > 0) {
      normalized.tags = [...filters.tags].sort();
    }
    const trimmed = filters.searchQuery?.trim();
    if (trimmed) normalized.searchQuery = trimmed;
    return normalized;
  }, [
    filters.profileId,
    filters.type,
    filters.status,
    filters.source,
    filters.tags,
    filters.searchQuery,
  ]);

  return useInfiniteQuery({
    queryKey: ["memories", normalizedFilters],
    enabled: isAuthenticated && filters.enabled !== false,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MemoryListResult> => {
      return await listMemoriesAction({
        profileId: normalizedFilters.profileId ?? undefined,
        type: normalizedFilters.type,
        status: normalizedFilters.status,
        source: normalizedFilters.source,
        tags: normalizedFilters.tags,
        searchQuery: normalizedFilters.searchQuery,
        limit: MEMORY_LIST_PAGE_SIZE,
        offset: pageParam,
      });
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.memories.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

/** Flat list of memories with loading flags, derived from useMemoryListPage. */
export function useMemoryListFlat(filters: MemoryListFilters) {
  const query = useMemoryListPage(filters);
  const memories = useMemo<Memory[]>(() => {
    if (!query.data) return [];
    const out: Memory[] = [];
    for (const page of query.data.pages) {
      for (const m of page.memories) {
        out.push(memoryFromApi(m));
      }
    }
    return out;
  }, [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  return {
    memories,
    total,
    isLoading: query.isLoading,
    // A failed load renders identically to "no memories" otherwise —
    // callers must surface this instead of showing a silent blank list
    isError: query.isError,
    refetch: query.refetch,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
