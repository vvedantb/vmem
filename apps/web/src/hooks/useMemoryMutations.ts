import {
  useConvexAuth,
  useAction,
  useMutation as useConvexMutation,
} from "convex/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@vmem/backend";
import { memoryFromApi, summaryFromApi, type Memory } from "@/lib/memories";
import { parseConvexStorageUpload } from "@/lib/schemas";
import { useActiveProfileId } from "@/components/workspace/active-profile";
import {
  insertMemoryInLists,
  patchMemoryInLists,
  removeMemoryFromLists,
} from "@/lib/convex-optimistic";
import {
  addMemoryToFacets,
  patchMemoryInFacets,
  removeMemoryFromFacets,
  scheduleFacetsRefetch,
} from "@/lib/memory-facets-cache";

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
  const createMemoryMutation = useConvexMutation(
    api.memoryApi.create,
  ).withOptimisticUpdate((localStore, args) => {
    insertMemoryInLists(localStore, args);
  });
  const updateMemoryMutation = useConvexMutation(
    api.memoryApi.update,
  ).withOptimisticUpdate((localStore, args) => {
    patchMemoryInLists(localStore, args);
  });
  const deleteMemoryMutation = useConvexMutation(
    api.memoryApi.remove,
  ).withOptimisticUpdate((localStore, args) => {
    removeMemoryFromLists(localStore, args.memoryId);
  });
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
    scheduleFacetsRefetch(queryClient);
  };

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

  const createMemory = async (input: CreateMemoryInput): Promise<Memory> => {
    if (!isAuthenticated) throw new Error("Not authenticated");
    const created = await createMemoryMutation({
      title: input.title.trim(),
      content: input.content.trim(),
      type: "knowledge",
      source: "web",
      tags: input.tags ?? [],
      confidence: 1.0,
      profileId: input.profileId ?? activeProfileId,
    });
    addMemoryToFacets(queryClient, summaryFromApi(created));
    invalidateMemories();
    return memoryFromApi(created);
  };

  const updateMemory = async (input: UpdateMemoryInput): Promise<Memory> => {
    if (!isAuthenticated) throw new Error("Not authenticated");
    const apiMemory = await updateMemoryMutation({
      memoryId: input.id,
      title: input.title,
      content: input.content,
      tags: input.tags,
      profileId: input.profileId ?? activeProfileId,
    });
    if (apiMemory === null) {
      throw new Error("Memory not found");
    }
    patchMemoryInFacets(queryClient, apiMemory.id, {
      title: apiMemory.title,
      tags: apiMemory.tags,
      type: apiMemory.type,
      status: apiMemory.status,
    });
    invalidateMemories();
    return memoryFromApi(apiMemory);
  };

  const deleteMemory = async (id: string): Promise<boolean> => {
    if (!isAuthenticated) throw new Error("Not authenticated");
    await deleteMemoryMutation({
      memoryId: id,
      profileId: activeProfileId,
    });
    removeMemoryFromFacets(queryClient, id);
    invalidateMemories();
    return true;
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
