"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@vmem/backend";
import type { FileCategory, FileItem } from "@/lib/file-types";
import { useActiveProfile } from "@/components/workspace/active-profile";

const DEFAULT_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024;

interface UseFilesDataResult {
  allFiles: FileItem[];
  isLoading: boolean;
  totalBytes: number;
  storageLimit: number;
  uploadFile: (file: File, parentFolderId: string | null) => Promise<void>;
  createFolder: (name: string, parentFolderId: string | null) => Promise<void>;
  renameNode: (id: string, name: string) => Promise<void>;
  moveNodes: (ids: string[], targetFolderId: string | null) => Promise<void>;
  deleteNodes: (ids: string[]) => Promise<void>;
}

/** Map a stored MIME type to the icon/display category used by the file UI. */
function fileCategoryFor(mimeType: string | undefined): FileCategory {
  const mime = mimeType ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("word") || mime === "application/msword") return "doc";
  if (mime.includes("sheet") || mime.includes("excel")) return "excel";
  return "generic";
}

/**
 * Files data layer bound directly to the live Convex `files.listTree` query —
 * no local mirror, so any upload/move/delete (web or MCP) reflects immediately.
 *
 * The presentational components speak the `FileItem` view-model (string ids,
 * display category, ISO dates), so we map each `fileNodes` doc here and keep the
 * raw nodes around to resolve those string ids back to branded `Id<"fileNodes">`
 * at the mutation boundary (avoids casts).
 */
export function useFilesData(): UseFilesDataResult {
  // Active workspace scope: personal files, or the team's shared drive.
  const teamId = useActiveProfile().teamId;
  const data = useQuery(api.files.listTree, { teamId });
  const nodes = useMemo(() => data?.nodes ?? [], [data]);

  const generateUploadUrl = useMutation(api.files.generateFileUploadUrl);
  const createFileMutation = useMutation(api.files.createFile);
  const createFolderMutation = useMutation(api.files.createFolder);
  const renameMutation = useMutation(api.files.renameNode);
  const moveMutation = useMutation(api.files.moveNodes);
  const deleteMutation = useMutation(api.files.deleteNodes);

  const allFiles = useMemo<FileItem[]>(() => {
    const childCount = new Map<string, number>();
    for (const node of nodes) {
      if (node.parentId) {
        childCount.set(node.parentId, (childCount.get(node.parentId) ?? 0) + 1);
      }
    }
    return nodes.map((node) => {
      const isFolder = node.kind === "folder";
      const category: FileCategory = isFolder
        ? "folder"
        : fileCategoryFor(node.mimeType);
      const url = node.url ?? undefined;
      return {
        id: node._id,
        name: node.name,
        itemType: isFolder ? "folder" : "file",
        mimeType: node.mimeType ?? "",
        fileCategory: category,
        size: node.size ?? 0,
        uploadedAt: new Date(node.createdAt).toISOString(),
        parentFolderId: node.parentId ?? null,
        thumbnailUrl: !isFolder && category === "image" ? url : undefined,
        url,
        itemCount: isFolder ? (childCount.get(node._id) ?? 0) : undefined,
        memoryId: node.memoryId,
        indexStatus: node.indexStatus,
      };
    });
  }, [nodes]);

  // Resolve a UI string id to the branded node id from the live query result.
  const toNodeId = useCallback(
    (id: string | null): Id<"fileNodes"> | undefined => {
      if (id === null) return undefined;
      return nodes.find((node) => node._id === id)?._id;
    },
    [nodes],
  );

  const toNodeIds = useCallback(
    (ids: string[]): Array<Id<"fileNodes">> => {
      const wanted = new Set(ids);
      return nodes
        .filter((node) => wanted.has(node._id))
        .map((node) => node._id);
    },
    [nodes],
  );

  const uploadFile = useCallback(
    async (file: File, parentFolderId: string | null): Promise<void> => {
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
      const json: { storageId: Id<"_storage"> } = await response.json();
      await createFileMutation({
        name: file.name,
        parentId: toNodeId(parentFolderId),
        storageId: json.storageId,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        teamId,
      });
    },
    [generateUploadUrl, createFileMutation, toNodeId, teamId],
  );

  const createFolder = useCallback(
    async (name: string, parentFolderId: string | null): Promise<void> => {
      await createFolderMutation({
        name,
        parentId: toNodeId(parentFolderId),
        teamId,
      });
    },
    [createFolderMutation, toNodeId, teamId],
  );

  const renameNode = useCallback(
    async (id: string, name: string): Promise<void> => {
      const nodeId = toNodeId(id);
      if (!nodeId) return;
      await renameMutation({ nodeId, name });
    },
    [renameMutation, toNodeId],
  );

  const moveNodes = useCallback(
    async (ids: string[], targetFolderId: string | null): Promise<void> => {
      await moveMutation({
        nodeIds: toNodeIds(ids),
        targetParentId: toNodeId(targetFolderId),
      });
    },
    [moveMutation, toNodeIds, toNodeId],
  );

  const deleteNodes = useCallback(
    async (ids: string[]): Promise<void> => {
      await deleteMutation({ nodeIds: toNodeIds(ids) });
    },
    [deleteMutation, toNodeIds],
  );

  return {
    allFiles,
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
