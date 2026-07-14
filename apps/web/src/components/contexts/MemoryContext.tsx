"use client";

// app-wide memory data facade for chat, extension flows, and legacy views

import { createContext, useCallback, use, useMemo } from "react";
import {
  useConvexAuth,
  useAction,
  useMutation as useConvexMutation,
} from "convex/react";
import {
  useQuery as useTanstackQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { memoryFromApi, type Memory } from "@/lib/memories";
import { api } from "@vmem/backend";
import { parseConvexStorageUpload } from "@/lib/schemas";
import { useActiveProfileId } from "@/components/workspace/active-profile";

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
  profileId?: string;
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
}

const MemoryContext = createContext<MemoryContextType | null>(null);

// upper bound on the "context" memory list
const CONTEXT_MEMORY_LIMIT = 1000;

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const queryClient = useQueryClient();
  const activeProfileId = useActiveProfileId();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);
  const createMemoryAction = useAction(api.memoryApi.createMemory);
  const updateMemoryAction = useAction(api.memoryApi.updateMemory);
  const deleteMemoryAction = useAction(api.memoryApi.deleteMemory);
  const generateUploadUrl = useConvexMutation(
    api.memoryApi.generateMemoryUploadUrl,
  );
  const importFromFile = useAction(api.fileImport.importMemoryFromFile);
  // workspace-scoped recent slice for tag suggestions / filter options
  const recentQueryKey = [
    "memories",
    "recent",
    activeProfileId ?? "none",
  ] as const;
  const memoriesQuery = useTanstackQuery({
    queryKey: recentQueryKey,
    queryFn: async (): Promise<Memory[]> => {
      const data = await listMemoriesAction({
        limit: CONTEXT_MEMORY_LIMIT,
        offset: 0,
        profileId: activeProfileId,
      });
      return data.memories.map((m) => memoryFromApi(m));
    },
    enabled: isAuthenticated && activeProfileId !== undefined,
  });

  // shared invalidator for paginated + recent memory caches
  const invalidateMemories = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["memories"] });
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
        profileId: input.profileId ?? activeProfileId,
      });
      // pass the action result as a variable (not a fresh literal) so
      // extra MemoryWithTags fields don't trip excess-property checks
      return memoryFromApi(created);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: recentQueryKey });
      const previous = queryClient.getQueryData<Memory[]>(recentQueryKey);
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
      queryClient.setQueryData<Memory[]>(recentQueryKey, (old) =>
        old ? [optimistic, ...old] : [optimistic],
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(recentQueryKey, context.previous);
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
        profileId: input.profileId ?? activeProfileId,
      });
      if (apiMemory === null) {
        throw new Error("Memory not found");
      }
      return { memory: memoryFromApi(apiMemory), id: input.id };
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: recentQueryKey });
      const previous = queryClient.getQueryData<Memory[]>(recentQueryKey);
      queryClient.setQueryData<Memory[]>(recentQueryKey, (old) =>
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
        queryClient.setQueryData(recentQueryKey, context.previous);
      }
    },
    onSettled: invalidateMemories,
  });

  const uploadMutation = useMutation({
    mutationFn: async (input: UploadMemoryFileInput): Promise<Memory> => {
      // 1. Get a one-shot upload URL from Convex storage
      const uploadUrl = await generateUploadUrl();

      // 2. POST the raw file bytes. Convex returns `{ storageId }` on
      //    success — that ID is the handle we forward to the import action
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
      // boundary so the branded ID flows into `importFromFile` without `as`
      const storageId = parseConvexStorageUpload(await uploadResponse.json());
      if (!storageId) {
        throw new Error("Invalid upload response from storage");
      }

      // hand storageId to import action (extract/hash/createMemory)
      const created = await importFromFile({
        storageId,
        filename: input.file.name,
        mimeType: input.file.type,
        profileId: input.profileId ?? activeProfileId,
      });
      return memoryFromApi(created);
    },
    onSettled: invalidateMemories,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<string> => {
      await deleteMemoryAction({
        memoryId: id,
        profileId: activeProfileId,
      });
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: recentQueryKey });
      const previous = queryClient.getQueryData<Memory[]>(recentQueryKey);
      queryClient.setQueryData<Memory[]>(recentQueryKey, (old) =>
        old ? old.filter((m) => m.id !== id) : [],
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(recentQueryKey, context.previous);
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

  const value = useMemo(
    () => ({
      memories: memoriesQuery.data ?? [],
      isLoading: memoriesQuery.isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
      uploadMemoryFile,
    }),
    [
      memoriesQuery.data,
      memoriesQuery.isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
      uploadMemoryFile,
    ],
  );

  return (
    <MemoryContext.Provider value={value}>{children}</MemoryContext.Provider>
  );
}

export function useMemoryContext() {
  const context = use(MemoryContext);
  if (!context) {
    throw new Error("useMemoryContext must be used within a MemoryProvider");
  }
  return context;
}
