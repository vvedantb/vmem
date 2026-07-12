"use client";

import { useState, useCallback } from "react";
import { useQueryStates } from "nuqs";
import { toast } from "sonner";
import { VmemSpinner } from "@/components/svg-animations";
import type { FileItem, FolderBreadcrumb } from "@/lib/file-types";
import PageContainer from "@/components/PageContainer";
import FileUploadModal from "@/components/FileUploadModal";
import FilePreviewModal from "@/components/FilePreviewModal";
import { filesSearchParams } from "./-searchParams";
import { sortFiles } from "./_utils";
import { useFileSelection } from "./_hooks/useFileSelection";
import { useFilesData } from "./_hooks/useFilesData";
import BreadcrumbNav from "./BreadcrumbNav";
import FileToolbar from "./FileToolbar";
import BulkActionBar from "./BulkActionBar";
import FileDropZone from "./FileDropZone";
import FileGrid from "./FileGrid";
import FileListView from "./FileListView";
import FileEmptyState from "./FileEmptyState";
import StorageStatusBar from "./StorageStatusBar";
import MoveFolderDialog from "./MoveFolderDialog";
import RenameDialog from "./RenameDialog";

export default function FilesClient() {
  const [params, setParams] = useQueryStates(filesSearchParams);

  const {
    allFiles,
    isLoading,
    totalBytes,
    storageLimit,
    uploadFile,
    createFolder,
    renameNode,
    moveNodes,
    deleteNodes,
  } = useFilesData();

  // Modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [pendingMoveIds, setPendingMoveIds] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Derived: items in current folder, sorted
  const currentItems = sortFiles(
    allFiles.filter((f) => f.parentFolderId === (params.folderId ?? null)),
    params.sort,
    params.sortDir,
  );

  const orderedIds = currentItems.map((f) => f.id);
  const selection = useFileSelection(orderedIds);

  const allFolders = allFiles.filter((f) => f.itemType === "folder");

  // Build breadcrumb path
  const buildBreadcrumbs = useCallback((): FolderBreadcrumb[] => {
    const crumbs: FolderBreadcrumb[] = [{ id: null, name: "Files" }];
    let currentId = params.folderId ?? null;
    const visited = new Set<string>();

    while (currentId !== null) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const folder = allFiles.find((f) => f.id === currentId);
      if (folder) {
        crumbs.push({ id: folder.id, name: folder.name });
        currentId = folder.parentFolderId;
      } else {
        break;
      }
    }

    // Reverse non-root crumbs to get root→leaf order
    if (crumbs.length > 1) {
      const root = crumbs.at(0);
      if (root === undefined) return crumbs;
      return [root, ...crumbs.slice(1).reverse()];
    }
    return crumbs;
  }, [allFiles, params.folderId]);

  const breadcrumbs = buildBreadcrumbs();

  // Navigation
  const navigateToFolder = useCallback(
    (folderId: string | null) => {
      void setParams({ folderId });
      selection.clear();
    },
    [setParams, selection],
  );

  // Actions
  const handleOpen = useCallback(
    (item: FileItem) => {
      if (item.itemType === "folder") {
        navigateToFolder(item.id);
      } else {
        setSelectedFile(item);
        setIsPreviewOpen(true);
      }
    },
    [navigateToFolder],
  );

  const handleDownload = useCallback((item: FileItem) => {
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
  }, []);

  const handleDelete = useCallback(
    async (item: FileItem) => {
      try {
        await deleteNodes([item.id]);
        toast.success(`Deleted ${item.name}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete file",
        );
      }
    },
    [deleteNodes],
  );

  const handleMoveTo = useCallback((item: FileItem) => {
    setPendingMoveIds([item.id]);
    setIsMoveDialogOpen(true);
  }, []);

  const handleRename = useCallback((item: FileItem) => {
    setRenameTarget(item);
  }, []);

  const handleRenameConfirm = useCallback(
    async (name: string) => {
      if (!renameTarget) return;
      try {
        await renameNode(renameTarget.id, name);
        toast.success("Renamed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to rename");
      } finally {
        setRenameTarget(null);
      }
    },
    [renameTarget, renameNode],
  );

  const handleMoveConfirm = useCallback(
    async (targetFolderId: string | null) => {
      try {
        await moveNodes(pendingMoveIds, targetFolderId);
        toast.success("Items moved");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move");
      } finally {
        selection.clear();
        setPendingMoveIds([]);
      }
    },
    [pendingMoveIds, moveNodes, selection],
  );

  // Bulk actions
  const handleBulkDownload = useCallback(() => {
    const selected = allFiles.filter(
      (f) => selection.selectedIds.has(f.id) && f.itemType === "file",
    );
    for (const item of selected) {
      handleDownload(item);
    }
  }, [allFiles, selection.selectedIds, handleDownload]);

  const handleBulkDelete = useCallback(async () => {
    try {
      await deleteNodes(Array.from(selection.selectedIds));
      toast.success("Items deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      selection.clear();
    }
  }, [selection, deleteNodes]);

  const handleBulkMove = useCallback(() => {
    setPendingMoveIds(Array.from(selection.selectedIds));
    setIsMoveDialogOpen(true);
  }, [selection.selectedIds]);

  // New folder
  const handleNewFolderConfirm = useCallback(
    async (name: string) => {
      setIsCreatingFolder(false);
      try {
        await createFolder(name, params.folderId ?? null);
        toast.success(`Created folder "${name}"`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to create folder",
        );
      }
    },
    [params.folderId, createFolder],
  );

  const handleUpload = useCallback(
    async (file: File) => {
      await uploadFile(file, params.folderId ?? null);
    },
    [uploadFile, params.folderId],
  );

  // Drop zone
  const handleFilesDropped = useCallback((files: File[]) => {
    setDroppedFiles(files);
    setIsUploadModalOpen(true);
  }, []);

  const handleUploadModalClose = useCallback(() => {
    setIsUploadModalOpen(false);
    setDroppedFiles([]);
  }, []);

  if (isLoading) {
    return (
      <PageContainer title="Files">
        <div className="flex h-full min-h-0 items-center justify-center">
          <VmemSpinner size={24} className="text-muted" />
        </div>
      </PageContainer>
    );
  }

  const isRoot = params.folderId === null;
  const showEmpty = currentItems.length === 0 && !isCreatingFolder;

  return (
    <PageContainer
      title="Files"
      noScroll
      breadcrumb={
        <BreadcrumbNav
          breadcrumbs={breadcrumbs}
          onNavigate={navigateToFolder}
        />
      }
      rightSection={
        <FileToolbar
          view={params.view}
          sort={params.sort}
          sortDir={params.sortDir}
          onViewChange={(view) => setParams({ view })}
          onSortSelect={(sort, sortDir) => setParams({ sort, sortDir })}
          onNewFolder={() => setIsCreatingFolder(true)}
          onUpload={() => setIsUploadModalOpen(true)}
        />
      }
    >
      <div className="flex flex-col h-full min-h-0">
        {/* Bulk action bar */}
        <BulkActionBar
          selectedCount={selection.selectedCount}
          onDownload={handleBulkDownload}
          onMove={handleBulkMove}
          onDelete={handleBulkDelete}
          onClear={selection.clear}
        />

        {/* Main content with drop zone */}
        <FileDropZone onFilesDropped={handleFilesDropped}>
          <div className="h-full overflow-y-auto scrollbar-thin">
            {showEmpty ? (
              <FileEmptyState
                isRoot={isRoot}
                onUpload={() => setIsUploadModalOpen(true)}
              />
            ) : params.view === "grid" ? (
              <FileGrid
                items={currentItems}
                isCreatingFolder={isCreatingFolder}
                isSelected={selection.isSelected}
                onClick={selection.handleClick}
                onCheckbox={selection.handleCheckbox}
                onOpen={handleOpen}
                onDownload={handleDownload}
                onMoveTo={handleMoveTo}
                onRename={handleRename}
                onDelete={handleDelete}
                onNewFolderConfirm={handleNewFolderConfirm}
                onNewFolderCancel={() => setIsCreatingFolder(false)}
              />
            ) : (
              <FileListView
                items={currentItems}
                isCreatingFolder={isCreatingFolder}
                isAllSelected={selection.isAllSelected}
                isSelected={selection.isSelected}
                onClick={selection.handleClick}
                onCheckbox={selection.handleCheckbox}
                onSelectAll={selection.handleSelectAll}
                onOpen={handleOpen}
                onDownload={handleDownload}
                onMoveTo={handleMoveTo}
                onRename={handleRename}
                onDelete={handleDelete}
                onNewFolderConfirm={handleNewFolderConfirm}
                onNewFolderCancel={() => setIsCreatingFolder(false)}
              />
            )}
          </div>
        </FileDropZone>

        {/* Storage status bar */}
        <StorageStatusBar
          itemCount={allFiles.length}
          totalBytes={totalBytes}
          storageLimit={storageLimit}
        />
      </div>

      {/* Modals */}
      <FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={handleUploadModalClose}
        onUpload={handleUpload}
        initialFiles={droppedFiles.length > 0 ? droppedFiles : undefined}
      />

      <FilePreviewModal
        isOpen={isPreviewOpen}
        file={selectedFile}
        onClose={() => {
          setIsPreviewOpen(false);
          setSelectedFile(null);
        }}
        onDelete={handleDelete}
      />

      <RenameDialog
        key={renameTarget?.id ?? "rename"}
        isOpen={renameTarget !== null}
        currentName={renameTarget?.name ?? ""}
        onRename={handleRenameConfirm}
        onClose={() => setRenameTarget(null)}
      />

      <MoveFolderDialog
        isOpen={isMoveDialogOpen}
        folders={allFolders}
        currentFolderId={params.folderId ?? null}
        itemCount={pendingMoveIds.length}
        onMove={handleMoveConfirm}
        onClose={() => {
          setIsMoveDialogOpen(false);
          setPendingMoveIds([]);
        }}
      />
    </PageContainer>
  );
}
