import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import {
  memoryFromApi,
  type Memory,
  type MemoryListResult,
} from "@/lib/memories";
import { api } from "@vmem/backend";

const MEMORY_LIST_PAGE_SIZE = 100;
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

function listFilterKey(filters: MemoryListFilters): string {
  return JSON.stringify({
    profileId: filters.profileId ?? null,
    type: filters.type ?? null,
    source: filters.source ?? null,
    tags: filters.tags ?? [],
    searchQuery: filters.searchQuery ?? null,
    fetchAll: filters.fetchAll === true,
  });
}

function listMemoriesArgs(filters: MemoryListFilters, limit: number) {
  return {
    profileId: filters.profileId ?? undefined,
    type: filters.type,
    source: filters.source,
    tags: filters.tags,
    searchQuery: filters.searchQuery,
    limit,
    offset: 0,
  };
}

export function useMemoryListFlat(filters: MemoryListFilters) {
  const { isAuthenticated } = useConvexAuth();
  const normalizedFilters = normalizeMemoryListFilters(filters);
  const fetchAll = filters.fetchAll === true;
  const filterKey = listFilterKey(normalizedFilters);
  const [limitState, setLimitState] = useState({
    key: filterKey,
    limit: fetchAll ? MEMORY_LIST_ALL_CAP : MEMORY_LIST_PAGE_SIZE,
  });
  const limit =
    limitState.key === filterKey
      ? limitState.limit
      : fetchAll
        ? MEMORY_LIST_ALL_CAP
        : MEMORY_LIST_PAGE_SIZE;

  const enabled = isAuthenticated && filters.enabled !== false;
  const data: MemoryListResult | undefined = useQuery(
    api.memoryApi.list,
    enabled ? listMemoriesArgs(normalizedFilters, limit) : "skip",
  );

  const memories: Memory[] =
    data === undefined ? [] : data.memories.map(memoryFromApi);
  const hasNextPage =
    !fetchAll && data !== undefined && data.memories.length < data.total;

  return {
    memories,
    isLoading: enabled && data === undefined,
    isError: false,
    refetch: async () => undefined,
    isFetchingNextPage: false,
    hasNextPage,
    fetchNextPage: async () => {
      if (!hasNextPage) return;
      setLimitState({
        key: filterKey,
        limit: limit + MEMORY_LIST_PAGE_SIZE,
      });
    },
  };
}
