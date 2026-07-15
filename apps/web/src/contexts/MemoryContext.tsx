// app-wide memory data facade — composes hooks for stable useMemoryContext API

import { createContext, use, useMemo } from "react";
import { useRecentMemories } from "@/hooks/useRecentMemories";
import {
  useMemoryMutations,
  type CreateMemoryInput,
  type UpdateMemoryInput,
  type UploadMemoryFileInput,
} from "@/hooks/useMemoryMutations";
import type { Memory } from "@/lib/memories";

export type { CreateMemoryInput, UpdateMemoryInput, UploadMemoryFileInput };

interface MemoryContextType {
  memories: Memory[];
  isLoading: boolean;
  createMemory: (input: CreateMemoryInput) => Promise<Memory>;
  updateMemory: (input: UpdateMemoryInput) => Promise<Memory | null>;
  deleteMemory: (id: string) => Promise<boolean>;
  uploadMemoryFile: (input: UploadMemoryFileInput) => Promise<Memory>;
}

const MemoryContext = createContext<MemoryContextType | null>(null);

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const { memories, isLoading } = useRecentMemories();
  const { createMemory, updateMemory, deleteMemory, uploadMemoryFile } =
    useMemoryMutations();

  const value = useMemo(
    () => ({
      memories,
      isLoading,
      createMemory,
      updateMemory,
      deleteMemory,
      uploadMemoryFile,
    }),
    [
      memories,
      isLoading,
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

export { useRecentMemories } from "@/hooks/useRecentMemories";
export { useMemoryMutations } from "@/hooks/useMemoryMutations";
