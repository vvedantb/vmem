// app-wide memory data facade: composes hooks for stable useMemoryContext API

import { createContext, use } from "react";
import {
  useMemoryMutations,
  type CreateMemoryInput,
  type UpdateMemoryInput,
  type UploadMemoryFileInput,
} from "@/hooks/useMemoryMutations";
import type { Memory } from "@/lib/memories";

// Mutations only. The memory list itself is never held app-wide: lists read
// their own bounded pages and facets are fetched on demand (useMemoryFacets).
interface MemoryContextType {
  createMemory: (input: CreateMemoryInput) => Promise<Memory>;
  updateMemory: (input: UpdateMemoryInput) => Promise<Memory>;
  deleteMemory: (id: string) => Promise<boolean>;
  uploadMemoryFile: (input: UploadMemoryFileInput) => Promise<Memory>;
}

const MemoryContext = createContext<MemoryContextType | null>(null);

export function MemoryProvider({ children }: { children: React.ReactNode }) {
  const { createMemory, updateMemory, deleteMemory, uploadMemoryFile } =
    useMemoryMutations();

  return (
    <MemoryContext.Provider
      value={{
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
