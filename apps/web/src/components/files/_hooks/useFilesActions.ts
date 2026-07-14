"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@vmem/backend";
import type { FileTreeNode } from "../-types";
import type { UseFilesDataResult } from "./useFilesData";

type FilesMutations = Pick<
  UseFilesDataResult,
  "uploadFile" | "createFolder" | "renameNode" | "moveNodes" | "deleteNodes"
>;

export function useFilesActions(args: {
  folderId: Id<"fileNodes"> | null;
  nodes: FileTreeNode[];
  mutations: FilesMutations;
  clearSelection: () => void;
  selectedIds: Set<Id<"fileNodes">>;
  navigateToFolder: (folderId: Id<"fileNodes"> | null) => void;
}) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [previewNodeId, setPreviewNodeId] = useState<Id<"fileNodes"> | null>(
    null,
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [pendingMoveIds, setPendingMoveIds] = useState<Array<Id<"fileNodes">>>(
    [],
  );
  const [renameNodeId, setRenameNodeId] = useState<Id<"fileNodes"> | null>(
    null,
  );
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  function handleOpen(node: FileTreeNode) {
    if (node.kind === "folder") {
      args.navigateToFolder(node._id);
      return;
    }
    setPreviewNodeId(node._id);
    setIsPreviewOpen(true);
  }

  function handleDownload(node: FileTreeNode) {
    if (!node.url) {
      toast.error("Download URL unavailable");
      return;
    }
    const link = document.createElement("a");
    link.href = node.url;
    link.download = node.name;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Downloading ${node.name}`);
  }

  async function handleDelete(node: Pick<FileTreeNode, "_id" | "name">) {
    try {
      await args.mutations.deleteNodes([node._id]);
      toast.success(`Deleted ${node.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    }
  }

  async function handleRenameConfirm(name: string) {
    if (!renameNodeId) return;
    try {
      await args.mutations.renameNode(renameNodeId, name);
      toast.success("Renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setRenameNodeId(null);
    }
  }

  async function handleMoveConfirm(targetFolderId: Id<"fileNodes"> | null) {
    try {
      await args.mutations.moveNodes(pendingMoveIds, targetFolderId);
      toast.success("Items moved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move");
    } finally {
      args.clearSelection();
      setPendingMoveIds([]);
    }
  }

  function handleBulkDownload() {
    for (const node of args.nodes) {
      if (args.selectedIds.has(node._id) && node.kind === "file") {
        handleDownload(node);
      }
    }
  }

  async function handleBulkDelete() {
    try {
      await args.mutations.deleteNodes(Array.from(args.selectedIds));
      toast.success("Items deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      args.clearSelection();
    }
  }

  async function handleNewFolderConfirm(name: string) {
    setIsCreatingFolder(false);
    try {
      await args.mutations.createFolder(name, args.folderId);
      toast.success(`Created folder "${name}"`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create folder",
      );
    }
  }

  return {
    isUploadModalOpen,
    droppedFiles,
    previewNodeId,
    isPreviewOpen,
    isMoveDialogOpen,
    pendingMoveIds,
    renameNodeId,
    isCreatingFolder,
    openUpload: () => setIsUploadModalOpen(true),
    closeUpload: () => {
      setIsUploadModalOpen(false);
      setDroppedFiles([]);
    },
    closePreview: () => {
      setIsPreviewOpen(false);
      setPreviewNodeId(null);
    },
    openMove: (ids: Array<Id<"fileNodes">>) => {
      setPendingMoveIds(ids);
      setIsMoveDialogOpen(true);
    },
    closeMove: () => {
      setIsMoveDialogOpen(false);
      setPendingMoveIds([]);
    },
    setRenameNodeId,
    setIsCreatingFolder,
    handleOpen,
    handleDownload,
    handleDelete,
    handleMoveTo: (node: FileTreeNode) => {
      setPendingMoveIds([node._id]);
      setIsMoveDialogOpen(true);
    },
    handleRename: (node: FileTreeNode) => setRenameNodeId(node._id),
    handleRenameConfirm,
    handleMoveConfirm,
    handleBulkDownload,
    handleBulkDelete,
    handleBulkMove: () => {
      setPendingMoveIds(Array.from(args.selectedIds));
      setIsMoveDialogOpen(true);
    },
    handleNewFolderConfirm,
    handleUpload: async (file: File) => {
      await args.mutations.uploadFile(file, args.folderId);
    },
    handleFilesDropped: (files: File[]) => {
      setDroppedFiles(files);
      setIsUploadModalOpen(true);
    },
  };
}
