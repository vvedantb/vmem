import {
  useConvexAuth,
  useAction,
  useMutation as useConvexMutation,
} from "convex/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { memoryFromApi, type Memory } from "@/lib/memories";
import { parseConvexStorageUpload } from "@/lib/schemas";
import { useActiveProfileId } from "@/components/workspace/active-profile";

export interface CreateMemoryInput {
  title: string;
  content: string;
  tags?: string[];
  profileId?: string;
}

export interface UpdateMemoryInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  profileId?: string;
}

export interface UploadMemoryFileInput {
  file: File;
  profileId?: string;
}

export function useMemoryMutations() {
  const { isAuthenticated } = useConvexAuth();
  const queryClient = useQueryClient();
  const activeProfileId = useActiveProfileId();
  const createMemoryAction = useAction(api.memoryApi.createMemory);
  const updateMemoryAction = useAction(api.memoryApi.updateMemory);
  const deleteMemoryAction = useAction(api.memoryApi.deleteMemory);
  const generateUploadUrl = useConvexMutation(
    api.memoryApi.generateMemoryUploadUrl,
  );
  const importFromFile = useAction(api.fileImport.importMemoryFromFile);

  const invalidateMemories = () => {
    void queryClient.invalidateQueries({ queryKey: ["memories"] });
    void queryClient.invalidateQueries({ queryKey: ["memory"] });
    void queryClient.invalidateQueries({ queryKey: ["retrieveMemories"] });
    void queryClient.invalidateQueries({ queryKey: ["graph"] });
    void queryClient.invalidateQueries({ queryKey: ["graph-memory-search"] });
  };

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
      return memoryFromApi(created);
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
    onSettled: invalidateMemories,
  });

  const uploadMutation = useMutation({
    mutationFn: async (input: UploadMemoryFileInput): Promise<Memory> => {
      const uploadUrl = await generateUploadUrl();

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
      const storageId = parseConvexStorageUpload(await uploadResponse.json());
      if (!storageId) {
        throw new Error("Invalid upload response from storage");
      }

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
    onSettled: invalidateMemories,
  });

  const createMemory = async (input: CreateMemoryInput): Promise<Memory> => {
    if (!isAuthenticated) throw new Error("Not authenticated");
    return createMutation.mutateAsync(input);
  };

  const updateMemory = async (
    input: UpdateMemoryInput,
  ): Promise<Memory | null> => {
    if (!isAuthenticated) throw new Error("Not authenticated");
    try {
      const result = await updateMutation.mutateAsync(input);
      return result.memory;
    } catch {
      return null;
    }
  };

  const deleteMemory = async (id: string): Promise<boolean> => {
    if (!isAuthenticated) throw new Error("Not authenticated");
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  };

  const uploadMemoryFile = async (
    input: UploadMemoryFileInput,
  ): Promise<Memory> => {
    if (!isAuthenticated) throw new Error("Not authenticated");
    return uploadMutation.mutateAsync(input);
  };

  return {
    createMemory,
    updateMemory,
    deleteMemory,
    uploadMemoryFile,
  };
}
