"use client";

/**
 * App-wide memory data facade for chat, extension flows, and legacy views.
 *
 * Combines Convex actions (mutations/retrieve) with TanStack Query caching
 * so multiple surfaces share one API without each route re-wiring auth and
 * optimistic updates. New graph/list views should prefer controller hooks +
 * direct Convex queries where live data is enough.
 */

import { createContext, useCallback, useContext, useMemo } from "react";
import {
  useConvexAuth,
  useAction,
  useMutation as useConvexMutation,
} from "convex/react";
import {
  useQuery as useTanstackQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import type { Memory } from "@/lib/memories";
import { api } from "@vmem/backend";
import { parseConvexStorageUpload } from "@/lib/schemas";

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

interface UploadMemoryFileInput {
  file: File;
  profileId?: string;
}

interface MemoryContextType {
  memories: Memory[];
  isLoading: boolean;
  createMemory: (input: CreateMemoryInput) => Promise<Memory>;
  updateMemory: (input: UpdateMemoryInput) => Promise<Memory | null>;
  deleteMemory: (id: string) => Promise<boolean>;
  uploadMemoryFile: (input: UploadMemoryFileInput) => Promise<Memory>;
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
  sourceUrl?: string | null;
  sourceSyncedAt?: string | null;
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
const MEMORY_LIST_PAGE_SIZE = 100;

function isMemoryType(value: string): value is Memory["type"] {
  return value === "profile" || value === "episodic" || value === "knowledge";
}

function apiToMemory(m: {
  id: string;
  title: string;
  content: string;
  type: string;
  source: string;
  tags: string[];
  createdAt: string;
  sourceUrl?: string | null;
  sourceSyncedAt?: string | null;
  profileId?: string | null;
}): Memory {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    type: isMemoryType(m.type) ? m.type : "knowledge",
    source: m.source,
    sourceUrl: m.sourceUrl ?? null,
    sourceSyncedAt: m.sourceSyncedAt ?? null,
    tags: m.tags,
    createdAt: m.createdAt,
    profileId: m.profileId ?? undefined,
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
function useMemoryListPage(filters: MemoryListFilters) {
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
    // A failed load renders identically to "no memories" otherwise —
    // callers must surface this instead of showing a silent blank list.
    isError: query.isError,
    refetch: query.refetch,
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
  const generateUploadUrl = useConvexMutation(
    api.memoryApi.generateMemoryUploadUrl,
  );
  const importFromFile = useAction(api.fileImport.importMemoryFromFile);
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
      // Pass the action result as a variable (not a fresh literal) so
      // extra MemoryWithTags fields don't trip excess-property checks.
      return apiToMemory(created);
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
        sourceUrl: null,
        sourceSyncedAt: null,
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
      if (apiMemory === null) {
        throw new Error("Memory not found");
      }
      return { memory: apiToMemory(apiMemory), id: input.id };
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

  const uploadMutation = useMutation({
    mutationFn: async (input: UploadMemoryFileInput): Promise<Memory> => {
      // 1. Get a one-shot upload URL from Convex storage.
      const uploadUrl = await generateUploadUrl();

      // 2. POST the raw file bytes. Convex returns `{ storageId }` on
      //    success — that ID is the handle we forward to the import action.
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": input.file.type || "application/octet-stream",
        },
        body: input.file,
      });
      if (!uploadResponse.ok) {
        throw new Error(`File upload failed: ${uploadResponse.statusText}`);
      }
      // Convex's signed-upload endpoint returns `{ storageId }`. Parse at the
      // boundary so the branded ID flows into `importFromFile` without `as`.
      const storageId = parseConvexStorageUpload(await uploadResponse.json());
      if (!storageId) {
        throw new Error("Invalid upload response from storage");
      }

      // 3. Hand the storageId to the server action which extracts text,
      //    hashes it, and calls createMemoryInternal (with chunking
      //    automatically scheduled for long PDFs).
      const created = await importFromFile({
        storageId,
        filename: input.file.name,
        mimeType: input.file.type,
        profileId: input.profileId,
      });
      return apiToMemory(created);
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

  const uploadMemoryFile = useCallback(
    async (input: UploadMemoryFileInput): Promise<Memory> => {
      if (!isAuthenticated) throw new Error("Not authenticated");
      return uploadMutation.mutateAsync(input);
    },
    [isAuthenticated, uploadMutation],
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
      uploadMemoryFile,
      refreshMemories,
    }),
    [
      memoriesQuery.data,
      memoriesQuery.isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
      uploadMemoryFile,
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
