"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useConvexAuth, useAction } from "convex/react";
import {
  useQuery as useTanstackQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import type { Memory } from "@/lib/memories";
import { api } from "@vmem/backend";

interface CreateMemoryInput {
  title: string;
  content: string;
  tags?: string[];
  profileId?: string;
}

interface UpdateMemoryInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
}

interface MemoryContextType {
  memories: Memory[];
  isLoading: boolean;
  createMemory: (input: CreateMemoryInput) => Promise<Memory>;
  updateMemory: (input: UpdateMemoryInput) => Promise<Memory | null>;
  deleteMemory: (id: string) => Promise<boolean>;
  refreshMemories: () => Promise<void>;
}

const MemoryContext = createContext<MemoryContextType | null>(null);

interface ApiMemory {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  source: string;
  confidence: number;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  profileId?: string;
}

interface ApiMemoryPage {
  memories: ApiMemory[];
  total: number;
}

/**
 * Upper bound on the "context" memory list. At 12k memories the old
 * fetch-all loop (100 per page × 120 round trips) took ~10s. The primary
 * renderer (MemorySearch) now uses the paginated useMemoryListPage hook, so
 * this list only backs consumers that need a broad slice for tag suggestions
 * and filter-option derivation (TagInputWithSuggestions, MemoryListHeader-
 * Controls, etc.). 1000 most-recent memories is enough for those use cases
 * and loads in a single round trip.
 */
const CONTEXT_MEMORY_LIMIT = 1000;

/**
 * Page size for the paginated list hook. 100 is the sweet spot between
 * number of visible rows at once (Virtuoso renders ~30–40 at a time) and
 * Cypher overhead per request (the count CALL and the page CALL share the
 * same session, so fewer big pages beats many small ones).
 */
export const MEMORY_LIST_PAGE_SIZE = 100;

function isMemoryType(value: string): value is Memory["type"] {
  return value === "profile" || value === "episodic" || value === "knowledge";
}

function apiToMemory(m: ApiMemory): Memory {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    type: isMemoryType(m.type) ? m.type : "knowledge",
    source: m.source,
    tags: m.tags,
    createdAt: m.createdAt,
    profileId: m.profileId,
  };
}

/**
 * Filters forwarded to the server-paginated listMemories action. Each field
 * lands on a URL searchParam (nuqs) on the list page, so the cache key is
 * stable across navigations and the filter state is shareable/bookmarkable.
 */
export interface MemoryListFilters {
  profileId?: string | null;
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
}

/**
 * Paginated list hook for the memories page. Uses TanStack's
 * useInfiniteQuery, so `fetchNextPage` can be wired directly into Virtuoso's
 * endReached callback. Pages cache under ["memories", filters], and
 * mutations (create/update/delete in this file) invalidate the root
 * ["memories"] key so every filter combination refetches.
 */
export function useMemoryListPage(filters: MemoryListFilters) {
  const { isAuthenticated } = useConvexAuth();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);

  // Normalize so equivalent filter shapes produce the same cache key.
  // Arrays are defensively copied + sorted, strings are trimmed.
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
    enabled: isAuthenticated,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<ApiMemoryPage> => {
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

/**
 * Flat list of memories with an isLoading flag, derived from useMemoryListPage.
 * Exists to let the list UI render a simple `Memory[]` without each caller
 * having to flatten the infinite-query pages themselves.
 */
export function useMemoryListFlat(filters: MemoryListFilters) {
  const query = useMemoryListPage(filters);
  const memories = useMemo<Memory[]>(() => {
    if (!query.data) return [];
    const out: Memory[] = [];
    for (const page of query.data.pages) {
      for (const m of page.memories) {
        out.push(apiToMemory(m));
      }
    }
    return out;
  }, [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  return {
    memories,
    total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
  };
}

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const queryClient = useQueryClient();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);
  const createMemoryAction = useAction(api.memoryApi.createMemory);
  const updateMemoryAction = useAction(api.memoryApi.updateMemory);
  const deleteMemoryAction = useAction(api.memoryApi.deleteMemory);
  // Bounded single-query load for consumers that still want a broad slice
  // of memories (tag suggestions, filter-option derivation). This replaces
  // the old fetch-all loop that made 120 round trips for a 12k-memory user.
  // The list page itself uses useMemoryListPage for true pagination.
  const memoriesQuery = useTanstackQuery({
    queryKey: ["memories", "recent"],
    queryFn: async (): Promise<Memory[]> => {
      const data = await listMemoriesAction({
        limit: CONTEXT_MEMORY_LIMIT,
        offset: 0,
      });
      return data.memories.map((m) => apiToMemory(m));
    },
    enabled: isAuthenticated,
  });

  // Shared invalidator so every paginated filter cache AND the recent-
  // context cache refresh after any mutation. TanStack matches invalidations
  // by queryKey prefix, so ["memories"] covers both ["memories", "recent"]
  // and ["memories", { ...filters }].
  const invalidateMemories = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["memories"] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: async (input: CreateMemoryInput): Promise<Memory> => {
      const created = await createMemoryAction({
        title: input.title.trim(),
        content: input.content.trim(),
        type: "knowledge",
        source: "web",
        tags: input.tags ?? [],
        confidence: 1.0,
        profileId: input.profileId,
      });
      const memory = apiToMemory({
        id: created.id,
        userId: created.userId,
        title: created.title,
        content: created.content,
        type: created.type,
        source: created.source,
        confidence: created.confidence,
        status: created.status,
        tags: created.tags,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        expiresAt: created.expiresAt,
      });
      // Enrichment (tags, relations, entities) now runs server-side
      // automatically after memory creation via ctx.scheduler.runAfter
      return memory;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["memories", "recent"] });
      const previous = queryClient.getQueryData<Memory[]>([
        "memories",
        "recent",
      ]);
      const optimistic: Memory = {
        id: `temp-${Date.now()}`,
        title: input.title.trim(),
        content: input.content.trim(),
        type: "knowledge",
        source: "web",
        tags: input.tags ?? [],
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Memory[]>(["memories", "recent"], (old) =>
        old ? [optimistic, ...old] : [optimistic],
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["memories", "recent"], context.previous);
      }
    },
    onSettled: invalidateMemories,
  });

  const updateMutation = useMutation({
    mutationFn: async (
      input: UpdateMemoryInput,
    ): Promise<{ memory: Memory; id: string }> => {
      const apiMemory = await updateMemoryAction({
        memoryId: input.id,
        title: input.title,
        content: input.content,
        tags: input.tags,
      });
      return { memory: apiToMemory(apiMemory as ApiMemory), id: input.id };
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["memories", "recent"] });
      const previous = queryClient.getQueryData<Memory[]>([
        "memories",
        "recent",
      ]);
      queryClient.setQueryData<Memory[]>(["memories", "recent"], (old) =>
        old
          ? old.map((m) =>
              m.id === input.id
                ? {
                    ...m,
                    ...(input.title !== undefined
                      ? { title: input.title }
                      : {}),
                    ...(input.content !== undefined
                      ? { content: input.content }
                      : {}),
                    ...(input.tags !== undefined ? { tags: input.tags } : {}),
                  }
                : m,
            )
          : [],
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["memories", "recent"], context.previous);
      }
    },
    onSettled: invalidateMemories,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<string> => {
      await deleteMemoryAction({ memoryId: id });
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["memories", "recent"] });
      const previous = queryClient.getQueryData<Memory[]>([
        "memories",
        "recent",
      ]);
      queryClient.setQueryData<Memory[]>(["memories", "recent"], (old) =>
        old ? old.filter((m) => m.id !== id) : [],
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["memories", "recent"], context.previous);
      }
    },
    onSettled: invalidateMemories,
  });

  const createMemory = useCallback(
    async (input: CreateMemoryInput): Promise<Memory> => {
      if (!isAuthenticated) throw new Error("Not authenticated");
      return createMutation.mutateAsync(input);
    },
    [isAuthenticated, createMutation],
  );

  const updateMemory = useCallback(
    async (input: UpdateMemoryInput): Promise<Memory | null> => {
      if (!isAuthenticated) throw new Error("Not authenticated");
      try {
        const result = await updateMutation.mutateAsync(input);
        return result.memory;
      } catch {
        return null;
      }
    },
    [isAuthenticated, updateMutation],
  );

  const deleteMemory = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isAuthenticated) throw new Error("Not authenticated");
      try {
        await deleteMutation.mutateAsync(id);
        return true;
      } catch {
        return false;
      }
    },
    [isAuthenticated, deleteMutation],
  );

  const refreshMemories = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
  }, [queryClient]);

  const value = useMemo(
    () => ({
      memories: memoriesQuery.data ?? [],
      isLoading: memoriesQuery.isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
      refreshMemories,
    }),
    [
      memoriesQuery.data,
      memoriesQuery.isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
      refreshMemories,
    ],
  );

  return (
    <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>
  );
}

export function useMemoryContext() {
  const context = useContext(MemoryContext);
  if (!context) {
    throw new Error("useMemoryContext must be used within a MemoryProvider");
  }
  return context;
}
