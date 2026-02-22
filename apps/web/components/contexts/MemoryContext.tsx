"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Memory } from "@/lib/memories";
import { MOCK_MEMORIES } from "@/lib/mock-memories";

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
}

const MemoryContext = createContext<MemoryContextType | null>(null);

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .filter((tag) => tag.length > 0),
    ),
  );
}

function sortByNewest(memories: Memory[]): Memory[] {
  return [...memories].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function cloneSeedMemories(): Memory[] {
  return sortByNewest(
    MOCK_MEMORIES.map((memory) => ({
      ...memory,
      tags: [...memory.tags],
    })),
  );
}

function createMemoryId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setMemories(cloneSeedMemories());
    setIsLoading(false);
  }, []);

  const createMemory = useCallback(
    async (input: CreateMemoryInput): Promise<Memory> => {
      const title = input.title.trim();
      const content = input.content.trim();

      if (!title) {
        throw new Error("Title is required");
      }

      if (!content) {
        throw new Error("Content is required");
      }

      const memory: Memory = {
        id: createMemoryId(),
        title,
        content,
        tags: normalizeTags(input.tags ?? []),
        createdAt: new Date().toISOString(),
      };

      setMemories((prev) => sortByNewest([memory, ...prev]));
      return memory;
    },
    [],
  );

  const updateMemory = useCallback(
    async (input: UpdateMemoryInput): Promise<Memory | null> => {
      const existing = memories.find((memory) => memory.id === input.id);
      if (!existing) {
        return null;
      }

      const hasTitle = input.title !== undefined;
      const hasContent = input.content !== undefined;
      const hasTags = input.tags !== undefined;

      if (!hasTitle && !hasContent && !hasTags) {
        throw new Error("No updates provided");
      }

      const nextTitle = hasTitle ? input.title!.trim() : existing.title;
      const nextContent = hasContent ? input.content!.trim() : existing.content;

      if (!nextTitle) {
        throw new Error("Title cannot be empty");
      }

      if (!nextContent) {
        throw new Error("Content cannot be empty");
      }

      const updated: Memory = {
        ...existing,
        title: nextTitle,
        content: nextContent,
        tags: hasTags ? normalizeTags(input.tags ?? []) : existing.tags,
      };

      setMemories((prev) =>
        sortByNewest(
          prev.map((memory) => (memory.id === input.id ? updated : memory)),
        ),
      );

      return updated;
    },
    [memories],
  );

  const deleteMemory = useCallback(
    async (id: string): Promise<boolean> => {
      const exists = memories.some((memory) => memory.id === id);
      if (!exists) {
        return false;
      }

      setMemories((prev) => prev.filter((memory) => memory.id !== id));
      return true;
    },
    [memories],
  );

  const value = useMemo(
    () => ({
      memories,
      isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
    }),
    [memories, isLoading, createMemory, updateMemory, deleteMemory],
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
