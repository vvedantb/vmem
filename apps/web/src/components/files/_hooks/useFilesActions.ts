"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { FileItem } from "../-types";
import type { UseFilesDataResult } from "./useFilesData";

type FilesMutations = Pick<
  UseFilesDataResult,
  "uploadFile" | "createFolder" | "renameNode" | "moveNodes" | "deleteNodes"
>;

export function useFilesActions(args: {
  folderId: string | null;
  allFiles: FileItem[];
  mutations: FilesMutations;
  clearSelection: () => void;
  selectedIds: Set<string>;
  navigateToFolder: (folderId: string | null) => void;
}) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [pendingMoveIds, setPendingMoveIds] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  function handleOpen(item: FileItem) {
    if (item.itemType === "folder") {
      args.navigateToFolder(item.id);
      return;
    }
    setSelectedFile(item);
    setIsPreviewOpen(true);
  }

  function handleDownload(item: FileItem) {
    if (!item.url) {
      toast.error("Download URL unavailable");
      return;
    }
    const link = document.createElement("a");
    link.href = item.url;
    link.download = item.name;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Downloading ${item.name}`);
  }

  async function handleDelete(item: { id: string; name: string }) {
    try {
      await args.mutations.deleteNodes([item.id]);
      toast.success(`Deleted ${item.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete file");
    }
  }

  async function handleRenameConfirm(name: string) {
    if (!renameTarget) return;
    try {
      await args.mutations.renameNode(renameTarget.id, name);
      toast.success("Renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setRenameTarget(null);
    }
  }

  async function handleMoveConfirm(targetFolderId: string | null) {
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
    for (const item of args.allFiles) {
      if (args.selectedIds.has(item.id) && item.itemType === "file") {
        handleDownload(item);
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
    selectedFile,
    isPreviewOpen,
    isMoveDialogOpen,
    pendingMoveIds,
    renameTarget,
    isCreatingFolder,
    openUpload: () => setIsUploadModalOpen(true),
    closeUpload: () => {
      setIsUploadModalOpen(false);
      setDroppedFiles([]);
    },
    closePreview: () => {
      setIsPreviewOpen(false);
      setSelectedFile(null);
    },
    openMove: (ids: string[]) => {
      setPendingMoveIds(ids);
      setIsMoveDialogOpen(true);
    },
    closeMove: () => {
      setIsMoveDialogOpen(false);
      setPendingMoveIds([]);
    },
    setRenameTarget,
    setIsCreatingFolder,
    handleOpen,
    handleDownload,
    handleDelete,
    handleMoveTo: (item: FileItem) => {
      setPendingMoveIds([item.id]);
      setIsMoveDialogOpen(true);
    },
    handleRename: (item: FileItem) => setRenameTarget(item),
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
