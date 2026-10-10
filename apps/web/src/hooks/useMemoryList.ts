import { useAction, useConvexAuth, usePaginatedQuery } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { memoryFromSummary, type Memory } from "@/lib/memories";

// Small pages: every page is its own reactive query, so a write only re-runs
// (and re-reads) the one page it landed in instead of the whole loaded list.
const MEMORY_LIST_PAGE_SIZE = 40;
const MIN_ROWS_BEFORE_IDLE = 20;
const MEMORY_LIST_ALL_CAP = 10_000;

interface MemoryListFilters {
  profileId?: string | null;
  type?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
  // false skips the fetch when hybrid retrieve handles search
  enabled?: boolean;
  // one shot: walk every matching row (non-reactive) for the timeline
  fetchAll?: boolean;
}

interface NormalizedFilters {
  profileId?: string;
  type?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
}

function normalizeMemoryListFilters(
  filters: MemoryListFilters,
): NormalizedFilters {
  const normalized: NormalizedFilters = {};
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

export function useMemoryListFlat(filters: MemoryListFilters) {
  const { isAuthenticated } = useConvexAuth();
  const normalized = normalizeMemoryListFilters(filters);
  const fetchAll = filters.fetchAll === true;
  const enabled = isAuthenticated && filters.enabled !== false;

  const paginated = usePaginatedQuery(
    api.memoryApi.listSummaries,
    enabled && !fetchAll ? normalized : "skip",
    { initialNumItems: MEMORY_LIST_PAGE_SIZE },
  );

  // timeline: a cached, non-reactive full walk (re-fetched after writes)
  const listAll = useAction(api.memoryApi.listAllSummaries);
  const allQuery = useQuery({
    queryKey: ["memories", "list-all", normalized],
    enabled: enabled && fetchAll,
    // local writes invalidate ["memories"], which refetches this walk
    staleTime: 60_000,
    queryFn: async () => {
      const result = await listAll({
        ...normalized,
        limit: MEMORY_LIST_ALL_CAP,
      });
      return result.memories;
    },
  });

  const canLoadMore = paginated.status === "CanLoadMore";
  // Filters run after each page is read, so a sparse filter can return short or
  // empty pages; the list view keeps paging while this is set (see MemorySearch).
  const needsFill =
    !fetchAll && canLoadMore && paginated.results.length < MIN_ROWS_BEFORE_IDLE;

  const memories: Memory[] = (
    fetchAll ? (allQuery.data ?? []) : paginated.results
  ).map(memoryFromSummary);

  return {
    memories,
    isLoading: fetchAll
      ? enabled && allQuery.isLoading
      : enabled && paginated.status === "LoadingFirstPage",
    isError: fetchAll && allQuery.isError,
    refetch: async () => {
      if (fetchAll) await allQuery.refetch();
    },
    isFetchingNextPage: !fetchAll && paginated.status === "LoadingMore",
    hasNextPage: !fetchAll && canLoadMore,
    needsFill,
    fetchNextPage: async () => {
      if (!fetchAll && canLoadMore) paginated.loadMore(MEMORY_LIST_PAGE_SIZE);
    },
  };
}
