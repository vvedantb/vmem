import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@vmem/backend";
import { parseConvexStorageUpload } from "@/lib/schemas";
import { useActiveProfile } from "@/components/workspace/active-profile";

const DEFAULT_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024;

// files data layer bound directly to the live Convex `files.listTree` query
export function useFilesData() {
  const teamId = useActiveProfile().teamId;
  const data = useQuery(api.files.listTree, { teamId });
  const nodes = data?.nodes ?? [];

  const generateUploadUrl = useMutation(api.files.generateFileUploadUrl);
  const createFileMutation = useMutation(api.files.createFile);
  const createFolderMutation = useMutation(api.files.createFolder);
  const renameMutation = useMutation(api.files.renameNode);
  const moveMutation = useMutation(api.files.moveNodes);
  const deleteMutation = useMutation(api.files.deleteNodes);

  const toNodeId = (
    id: Id<"fileNodes"> | null,
  ): Id<"fileNodes"> | undefined => {
    if (id === null) return undefined;
    return nodes.find((node) => node._id === id)?._id;
  };

  const toNodeIds = (ids: Array<Id<"fileNodes">>): Array<Id<"fileNodes">> => {
    const wanted = new Set(ids);
    return nodes.filter((node) => wanted.has(node._id)).map((node) => node._id);
  };

  const uploadFile = async (
    file: File,
    parentFolderId: Id<"fileNodes"> | null,
  ): Promise<void> => {
    const uploadUrl = await generateUploadUrl();
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
    const storageId = parseConvexStorageUpload(await response.json());
    if (!storageId) {
      throw new Error("Invalid upload response from storage");
    }
    await createFileMutation({
      name: file.name,
      parentId: toNodeId(parentFolderId),
      storageId,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      teamId,
    });
  };

  const createFolder = async (
    name: string,
    parentFolderId: Id<"fileNodes"> | null,
  ): Promise<void> => {
    await createFolderMutation({
      name,
      parentId: toNodeId(parentFolderId),
      teamId,
    });
  };

  const renameNode = async (
    id: Id<"fileNodes">,
    name: string,
  ): Promise<void> => {
    const nodeId = toNodeId(id);
    if (!nodeId) return;
    await renameMutation({ nodeId, name });
  };

  const moveNodes = async (
    ids: Array<Id<"fileNodes">>,
    targetFolderId: Id<"fileNodes"> | null,
  ): Promise<void> => {
    await moveMutation({
      nodeIds: toNodeIds(ids),
      targetParentId: toNodeId(targetFolderId),
    });
  };

  const deleteNodes = async (ids: Array<Id<"fileNodes">>): Promise<void> => {
    await deleteMutation({ nodeIds: toNodeIds(ids) });
  };

  return {
    nodes,
    isLoading: data === undefined,
    totalBytes: data?.totalBytes ?? 0,
    storageLimit: data?.storageLimit ?? DEFAULT_STORAGE_LIMIT,
    uploadFile,
    createFolder,
    renameNode,
    moveNodes,
    deleteNodes,
  };
}

export type UseFilesDataResult = ReturnType<typeof useFilesData>;
