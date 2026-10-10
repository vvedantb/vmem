import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { memoryFromApi } from "@/lib/memories";
import { api } from "@vmem/backend";

const MEMORY_LIST_PAGE_SIZE = 100;
const MEMORY_LIST_ALL_CAP = 10_000;
const MEMORY_LIST_PAGE_SLOTS = 20;

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
  const normalizedFilters = normalizeMemoryListFilters(filters);
  const enabled =
    isAuthenticated && filters.enabled !== false && filters.fetchAll !== true;
  const [pageCount, setPageCount] = useState(1);
  const limit = Math.min(
    pageCount * MEMORY_LIST_PAGE_SIZE,
    MEMORY_LIST_PAGE_SLOTS * MEMORY_LIST_PAGE_SIZE,
  );
  const result = useQuery(
    api.memoryApi.listMemories,
    enabled
      ? {
          ...listMemoriesArgs(normalizedFilters),
          limit,
          offset: 0,
        }
      : "skip",
  );
  const memories = result?.memories.map(memoryFromApi) ?? [];
  const hasNextPage =
    result !== undefined &&
    memories.length < result.total &&
    pageCount < MEMORY_LIST_PAGE_SLOTS;

  return {
    memories,
    isLoading: enabled && result === undefined,
    isError: false,
    refetch: async () => undefined,
    isFetchingNextPage: false,
    hasNextPage,
    fetchNextPage: async () => {
      if (hasNextPage) setPageCount((count) => count + 1);
    },
  };
}

function useMemoryListAllPages(filters: MemoryListFilters) {
  const { isAuthenticated } = useConvexAuth();
  const normalizedFilters = normalizeMemoryListFilters(filters);
  const enabled =
    isAuthenticated && filters.enabled !== false && filters.fetchAll === true;
  const result = useQuery(
    api.memoryApi.listMemories,
    enabled
      ? {
          ...listMemoriesArgs(normalizedFilters),
          limit: MEMORY_LIST_ALL_CAP,
          offset: 0,
        }
      : "skip",
  );

  return {
    memories: result?.memories.map(memoryFromApi) ?? [],
    isLoading: enabled && result === undefined,
    isError: false,
    refetch: async () => undefined,
  };
}

export function useMemoryListFlat(filters: MemoryListFilters) {
  const paged = useMemoryListPage(filters);
  const all = useMemoryListAllPages(filters);

  if (filters.fetchAll === true) {
    return {
      memories: all.memories,
      isLoading: all.isLoading,
      isError: all.isError,
      refetch: all.refetch,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: async () => undefined,
    };
  }

  return paged;
}
