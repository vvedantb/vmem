import { useCallback } from "react";
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
import { recentMemoriesQueryKey } from "@/hooks/useRecentMemories";

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
  const recentQueryKey = recentMemoriesQueryKey(activeProfileId);
  const createMemoryAction = useAction(api.memoryApi.createMemory);
  const updateMemoryAction = useAction(api.memoryApi.updateMemory);
  const deleteMemoryAction = useAction(api.memoryApi.deleteMemory);
  const generateUploadUrl = useConvexMutation(
    api.memoryApi.generateMemoryUploadUrl,
  );
  const importFromFile = useAction(api.fileImport.importMemoryFromFile);

  const invalidateMemories = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["memories"] });
    void queryClient.invalidateQueries({ queryKey: ["memory"] });
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

  return {
    createMemory,
    updateMemory,
    deleteMemory,
    uploadMemoryFile,
  };
}
