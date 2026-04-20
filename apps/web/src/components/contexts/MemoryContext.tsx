"use client";

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
} from "@tanstack/react-query";
import type { Memory } from "@/lib/memories";
import { api } from "@vmem/backend";
import { useLocalLLM } from "@/components/contexts/LocalLLMContext";
import { runLocalFullEnrichment } from "@/lib/local-enrichment";

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
}

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
  };
}

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const queryClient = useQueryClient();
  const listMemoriesAction = useAction(api.memoryApi.listMemories);
  const createMemoryAction = useAction(api.memoryApi.createMemory);
  const updateMemoryAction = useAction(api.memoryApi.updateMemory);
  const deleteMemoryAction = useAction(api.memoryApi.deleteMemory);
  const listRecentForEnrichment = useAction(
    api.memoryApi.listRecentMemoryTitlesForEnrichment,
  );
  const applyEnrichmentAction = useAction(api.memoryApi.applyEnrichment);
  const enqueuePendingEnrichment = useConvexMutation(
    api.pendingEnrichment.enqueuePendingEnrichment,
  );
  const { model, engineState } = useLocalLLM();

  const enrichAfterCreate = useCallback(
    async (memoryId: string, title: string, content: string) => {
      if (engineState !== "ready" || model === null) {
        return;
      }
      try {
        const existing = await listRecentForEnrichment({
          excludeMemoryId: memoryId,
        });
        const parsed = await runLocalFullEnrichment(
          model,
          title,
          content,
          existing,
        );
        if (parsed === null) {
          return;
        }
        await applyEnrichmentAction({
          memoryId,
          tags: parsed.tags,
          relatedMemoryIds: parsed.relatedMemoryIds,
        });
      } catch (err) {
        console.error("[enrichment] web local enrichment failed:", err);
      }
    },
    [model, engineState, listRecentForEnrichment, applyEnrichmentAction],
  );

  const memoriesQuery = useTanstackQuery({
    queryKey: ["memories"],
    queryFn: async (): Promise<Memory[]> => {
      const PAGE_SIZE = 100;
      const all: Memory[] = [];
      let offset = 0;

      for (;;) {
        const data = await listMemoriesAction({
          limit: PAGE_SIZE,
          offset,
        });
        const result = data as { memories: ApiMemory[]; total: number };
        for (const m of result.memories) {
          all.push(apiToMemory(m));
        }

        if (all.length >= result.total || result.memories.length < PAGE_SIZE) {
          break;
        }
        offset += PAGE_SIZE;
      }

      return all;
    },
    enabled: isAuthenticated,
  });

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
      if (engineState === "ready" && model !== null) {
        void enrichAfterCreate(memory.id, memory.title, memory.content);
      } else {
        void enqueuePendingEnrichment({
          memoryId: memory.id,
          source: "web",
        });
      }
      return memory;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["memories"] });
      const previous = queryClient.getQueryData<Memory[]>(["memories"]);
      const optimistic: Memory = {
        id: `temp-${Date.now()}`,
        title: input.title.trim(),
        content: input.content.trim(),
        type: "knowledge",
        source: "web",
        tags: input.tags ?? [],
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Memory[]>(["memories"], (old) =>
        old ? [optimistic, ...old] : [optimistic],
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["memories"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
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
      await queryClient.cancelQueries({ queryKey: ["memories"] });
      const previous = queryClient.getQueryData<Memory[]>(["memories"]);
      queryClient.setQueryData<Memory[]>(["memories"], (old) =>
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
        queryClient.setQueryData(["memories"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<string> => {
      await deleteMemoryAction({ memoryId: id });
      return id;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["memories"] });
      const previous = queryClient.getQueryData<Memory[]>(["memories"]);
      queryClient.setQueryData<Memory[]>(["memories"], (old) =>
        old ? old.filter((m) => m.id !== id) : [],
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["memories"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
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
