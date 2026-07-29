// app-wide memory data facade: composes hooks for stable useMemoryContext API

import { createContext, use } from "react";
import { useRecentMemories } from "@/hooks/useRecentMemories";
import {
  useMemoryMutations,
  type CreateMemoryInput,
  type UpdateMemoryInput,
  type UploadMemoryFileInput,
} from "@/hooks/useMemoryMutations";
import type { Memory } from "@/lib/memories";

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

  return (
    <MemoryContext.Provider
      value={{
        memories,
        isLoading,
        createMemory,
        updateMemory,
        deleteMemory,
        uploadMemoryFile,
      }}
    >
      {children}
    </MemoryContext.Provider>
  );
}

export function useMemoryContext() {
  const context = use(MemoryContext);
  if (!context) {
    throw new Error("useMemoryContext must be used within a MemoryProvider");
  }
  return context;
}
