"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@clerk/nextjs";
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
  const { userId } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMemories = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/v1/memories?userId=${encodeURIComponent(userId)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          memories: ApiMemory[];
          total: number;
        };
        setMemories(data.memories.map(apiToMemory));
      } else {
        console.error(
          "fetchMemories: server error",
          res.status,
          res.statusText,
        );
      }
    } catch (err) {
      console.error("fetchMemories: network failure", err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  const createMemory = useCallback(
    async (input: CreateMemoryInput): Promise<Memory> => {
      if (!userId) throw new Error("Not authenticated");

      const res = await fetch(`${API_URL}/v1/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
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
      const memory = apiToMemory(apiMemory);
      setMemories((prev) => [memory, ...prev]);
      return memory;
    },
    [userId],
  );

  const updateMemory = useCallback(
    async (input: UpdateMemoryInput): Promise<Memory | null> => {
      if (!userId) throw new Error("Not authenticated");

      const res = await fetch(
        `${API_URL}/v1/memories/${input.id}?userId=${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: input.title,
            content: input.content,
            tags: input.tags,
          }),
        },
      );

      if (!res.ok) {
        console.error("updateMemory: server error", res.status, res.statusText);
        return null;
      }

      const apiMemory = (await res.json()) as ApiMemory;
      const memory = apiToMemory(apiMemory);
      setMemories((prev) => prev.map((m) => (m.id === input.id ? memory : m)));
      return memory;
    },
    [userId],
  );

  const deleteMemory = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) throw new Error("Not authenticated");

      const res = await fetch(
        `${API_URL}/v1/memories/${id}?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );

      if (!res.ok) return false;

      setMemories((prev) => prev.filter((m) => m.id !== id));
      return true;
    },
    [userId],
  );

  const value = useMemo(
    () => ({
      memories,
      isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
      refreshMemories: fetchMemories,
    }),
    [
      memories,
      isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
      fetchMemories,
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
