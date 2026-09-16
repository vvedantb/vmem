import { useConvexAuth, useAction } from "convex/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  memoryFromApi,
  type Memory,
  type MemoryListResult,
} from "@/lib/memories";
import { api } from "@vmem/backend";

const MEMORY_LIST_PAGE_SIZE = 100;
const MEMORY_LIST_ALL_PAGE_SIZE = 200;
const MEMORY_LIST_ALL_CAP = 10_000;

interface MemoryListFilters {
  profileId?: string | null;
  type?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  // false skips paginated fetch when hybrid retrieve handles search
  enabled?: boolean;
  // one shot: walk listMemories offsets until every matching row is loaded
  fetchAll?: boolean;
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
  if (filters.fetchAll) normalized.fetchAll = true;
  return normalized;
}

function listMemoriesArgs(filters: MemoryListFilters) {
  return {
    profileId: filters.profileId ?? undefined,
    type: filters.type,
    source: filters.source,
    tags: filters.tags,
    searchQuery: filters.searchQuery,
  };
}

function useMemoryListPage(filters: MemoryListFilters) {
  const { isAuthenticated } = useConvexAuth();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);

  // normalize filter shapes so equivalent inputs share a cache key
  const normalizedFilters = normalizeMemoryListFilters(filters);

  return useInfiniteQuery({
    queryKey: ["memories", normalizedFilters],
    enabled:
      isAuthenticated && filters.enabled !== false && filters.fetchAll !== true,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<MemoryListResult> => {
      return await listMemoriesAction({
        ...listMemoriesArgs(normalizedFilters),
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

function useMemoryListAllPages(filters: MemoryListFilters) {
  const { isAuthenticated } = useConvexAuth();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);
  const normalizedFilters = normalizeMemoryListFilters(filters);

  return useQuery({
    queryKey: ["memories", "all", normalizedFilters],
    enabled:
      isAuthenticated && filters.enabled !== false && filters.fetchAll === true,
    queryFn: async (): Promise<Memory[]> => {
      const out: Memory[] = [];
      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      while (out.length < total && out.length < MEMORY_LIST_ALL_CAP) {
        const page = await listMemoriesAction({
          ...listMemoriesArgs(normalizedFilters),
          limit: MEMORY_LIST_ALL_PAGE_SIZE,
          offset,
        });
        total = page.total;
        for (const row of page.memories) {
          out.push(memoryFromApi(row));
        }
        if (page.memories.length === 0) break;
        offset = out.length;
      }
      return out;
    },
  });
}

export function useMemoryListFlat(filters: MemoryListFilters) {
  const paged = useMemoryListPage(filters);
  const all = useMemoryListAllPages(filters);

  if (filters.fetchAll === true) {
    return {
      memories: all.data ?? [],
      isLoading: all.isLoading,
      isError: all.isError,
      refetch: all.refetch,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: async () => undefined,
    };
  }

  const memories: Memory[] = (() => {
    if (!paged.data) return [];
    const out: Memory[] = [];
    for (const page of paged.data.pages) {
      for (const m of page.memories) {
        out.push(memoryFromApi(m));
      }
    }
    return out;
  })();
  return {
    memories,
    isLoading: paged.isLoading,
    // failed load looks like empty list so callers must surface isError
    isError: paged.isError,
    refetch: paged.refetch,
    isFetchingNextPage: paged.isFetchingNextPage,
    hasNextPage: paged.hasNextPage,
    fetchNextPage: paged.fetchNextPage,
  };
}
