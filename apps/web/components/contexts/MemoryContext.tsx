"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  useQuery as useTanstackQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { Memory } from "@/lib/memories";
import { clientEnv } from "@/env/client";

const API_URL = clientEnv.NEXT_PUBLIC_API_URL;

interface CreateMemoryInput {
  title: string;
  content: string;
  tags?: string[];
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

function apiToMemory(m: ApiMemory): Memory {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    tags: m.tags,
    createdAt: m.createdAt,
  };
}

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const { userId, getToken } = useAuth();
  const queryClient = useQueryClient();

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const token = await getToken();
      const headers = new Headers(init?.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetch(url, { ...init, headers });
    },
    [getToken],
  );

  const memoriesQuery = useTanstackQuery({
    queryKey: ["memories"],
    queryFn: async (): Promise<Memory[]> => {
      const res = await authFetch(`${API_URL}/v1/memories?limit=1000`);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        memories: ApiMemory[];
        total: number;
      };
      return data.memories.map(apiToMemory);
    },
    enabled: !!userId,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateMemoryInput): Promise<Memory> => {
      const res = await authFetch(`${API_URL}/v1/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title.trim(),
          content: input.content.trim(),
          type: "knowledge",
          source: "web",
          tags: input.tags ?? [],
          confidence: 1.0,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }

      const apiMemory = (await res.json()) as ApiMemory;
      return apiToMemory(apiMemory);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["memories"] });
      const previous = queryClient.getQueryData<Memory[]>(["memories"]);
      const optimistic: Memory = {
        id: `temp-${Date.now()}`,
        title: input.title.trim(),
        content: input.content.trim(),
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
      const res = await authFetch(`${API_URL}/v1/memories/${input.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          content: input.content,
          tags: input.tags,
        }),
      });

      if (!res.ok) throw new Error("Update failed");

      const apiMemory = (await res.json()) as ApiMemory;
      return { memory: apiToMemory(apiMemory), id: input.id };
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
      const res = await authFetch(`${API_URL}/v1/memories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
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
      if (!userId) throw new Error("Not authenticated");
      return createMutation.mutateAsync(input);
    },
    [userId, createMutation],
  );

  const updateMemory = useCallback(
    async (input: UpdateMemoryInput): Promise<Memory | null> => {
      if (!userId) throw new Error("Not authenticated");
      try {
        const result = await updateMutation.mutateAsync(input);
        return result.memory;
      } catch {
        return null;
      }
    },
    [userId, updateMutation],
  );

  const deleteMemory = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) throw new Error("Not authenticated");
      try {
        await deleteMutation.mutateAsync(id);
        return true;
      } catch {
        return false;
      }
    },
    [userId, deleteMutation],
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
