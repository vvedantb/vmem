import { useConvexAuth, useAction } from "convex/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  memoryFromApi,
  type Memory,
  type MemoryListResult,
} from "@/lib/memories";
import { api } from "@vmem/backend";

const MEMORY_LIST_PAGE_SIZE = 100;

interface MemoryListFilters {
  profileId?: string | null;
  type?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  // false skips paginated fetch when hybrid retrieve handles search
  enabled?: boolean;
}

function normalizeMemoryListFilters(
  filters: MemoryListFilters,
): MemoryListFilters {
  const normalized: MemoryListFilters = {};
  if (filters.profileId !== undefined && filters.profileId !== null) {
    normalized.profileId = filters.profileId;
  }
  if (filters.type) normalized.type = filters.type;
  if (filters.source) normalized.source = filters.source;
  if (filters.tags && filters.tags.length > 0) {
    normalized.tags = [...filters.tags].sort();
  }
  const trimmed = filters.searchQuery?.trim();
  if (trimmed) normalized.searchQuery = trimmed;
  return normalized;
}

function useMemoryListPage(filters: MemoryListFilters) {
  const { isAuthenticated } = useConvexAuth();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);

  // normalize filter shapes so equivalent inputs share a cache key
  const normalizedFilters = normalizeMemoryListFilters(filters);

  return useInfiniteQuery({
    queryKey: ["memories", normalizedFilters],
    enabled: isAuthenticated && filters.enabled !== false,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MemoryListResult> => {
      return await listMemoriesAction({
        profileId: normalizedFilters.profileId ?? undefined,
        type: normalizedFilters.type,
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

export function useMemoryListFlat(filters: MemoryListFilters) {
  const query = useMemoryListPage(filters);
  const memories: Memory[] = (() => {
    if (!query.data) return [];
    const out: Memory[] = [];
    for (const page of query.data.pages) {
      for (const m of page.memories) {
        out.push(memoryFromApi(m));
      }
    }
    return out;
  })();
  return {
    memories,
    isLoading: query.isLoading,
    // failed load looks like empty list so callers must surface isError
    isError: query.isError,
    refetch: query.refetch,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}
