"use client";

import { useMemo } from "react";
import { useQueryStates } from "nuqs";
import type { Id } from "@vmem/backend";
import { VmemSpinner } from "@/components/svg-animations";
import type { FolderBreadcrumb, FileTreeNode } from "./-types";
import PageContainer from "@/components/PageContainer";
import FileUploadModal from "@/components/FileUploadModal";
import FilePreviewModal from "@/components/FilePreviewModal";
import { filesSearchParams } from "./search-params";
import { childCountMap, sortNodes } from "./_utils";
import { useFileSelection } from "./_hooks/useFileSelection";
import { useFilesData } from "./_hooks/useFilesData";
import { useFilesActions } from "./_hooks/useFilesActions";
import BreadcrumbNav from "./BreadcrumbNav";
import FileToolbar from "./FileToolbar";
import BulkActionBar from "./BulkActionBar";
import FileDropZone from "./FileDropZone";
import FileGrid from "./FileGrid";
import FileListView from "./FileListView";
import { FileEmptyStateFolder, FileEmptyStateRoot } from "./FileEmptyState";
import StorageStatusBar from "./StorageStatusBar";
import MoveFolderDialog from "./MoveFolderDialog";
import RenameDialog from "./RenameDialog";

const filesLoadingView = (
  <PageContainer title="Files">
    <div className="flex h-full min-h-0 items-center justify-center">
      <VmemSpinner size={24} className="text-muted" />
    </div>
  </PageContainer>
);

function buildBreadcrumbs(
  nodes: Pick<FileTreeNode, "_id" | "name" | "parentId">[],
  folderId: string | null,
): FolderBreadcrumb[] {
  const root: FolderBreadcrumb = { id: null, name: "Files" };
  if (folderId === null) return [root];

  const crumbs: FolderBreadcrumb[] = [root];
  let currentId: string | null = folderId;
  const visited = new Set<string>();

  while (currentId !== null) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const folder = nodes.find((node) => node._id === currentId);
    if (!folder) break;
    crumbs.push({ id: folder._id, name: folder.name });
    currentId = folder.parentId ?? null;
  }

  if (crumbs.length <= 1) return crumbs;
  return [root, ...crumbs.slice(1).reverse()];
}

function resolveFolderId(
  folderIdParam: string | null,
  nodes: FileTreeNode[],
): Id<"fileNodes"> | null {
  if (folderIdParam === null) return null;
  return nodes.find((node) => node._id === folderIdParam)?._id ?? null;
}

export default function FilesClient() {
  const [params, setParams] = useQueryStates(filesSearchParams);
  const folderIdParam = params.folderId ?? null;

  const {
    nodes,
    isLoading,
    totalBytes,
    storageLimit,
    uploadFile,
    createFolder,
    renameNode,
    moveNodes,
    deleteNodes,
  } = useFilesData();

  const folderId = resolveFolderId(folderIdParam, nodes);
  const childCounts = useMemo(() => childCountMap(nodes), [nodes]);
  const currentItems = sortNodes(
    nodes.filter((node) => (node.parentId ?? null) === folderIdParam),
    params.sort,
    params.sortDir,
  );
  const selection = useFileSelection(currentItems.map((node) => node._id));
  const folderNodes = nodes.filter((node) => node.kind === "folder");
  const breadcrumbs = buildBreadcrumbs(nodes, folderIdParam);

  function navigateToFolder(nextFolderId: Id<"fileNodes"> | null) {
    void setParams({ folderId: nextFolderId });
    selection.clear();
  }

  const actions = useFilesActions({
    folderId,
    nodes,
    mutations: {
      uploadFile,
      createFolder,
      renameNode,
      moveNodes,
      deleteNodes,
    },
    clearSelection: selection.clear,
    selectedIds: selection.selectedIds,
    navigateToFolder,
  });

  if (isLoading) {
    return filesLoadingView;
  }

  const isRoot = folderIdParam === null;
  const showEmpty = currentItems.length === 0 && !actions.isCreatingFolder;
  const previewNodeLive = actions.previewNodeId
    ? nodes.find((node) => node._id === actions.previewNodeId)
    : undefined;
  const renameNodeLive = actions.renameNodeId
    ? nodes.find((node) => node._id === actions.renameNodeId)
    : undefined;

  function handleItemDelete(node: Pick<FileTreeNode, "_id" | "name">) {
    void actions.handleDelete(node);
  }

  function handleNewFolderConfirm(name: string) {
    void actions.handleNewFolderConfirm(name);
  }

  function handleNewFolderCancel() {
    actions.setIsCreatingFolder(false);
  }

  const sharedItemViewProps = {
    items: currentItems,
    childCounts,
    isCreatingFolder: actions.isCreatingFolder,
    isSelected: selection.isSelected,
    onClick: selection.handleClick,
    onCheckbox: selection.handleCheckbox,
    onOpen: actions.handleOpen,
    onDownload: actions.handleDownload,
    onMoveTo: actions.handleMoveTo,
    onRename: actions.handleRename,
    onDelete: handleItemDelete,
    onNewFolderConfirm: handleNewFolderConfirm,
    onNewFolderCancel: handleNewFolderCancel,
  };

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
          onNewFolder={() => actions.setIsCreatingFolder(true)}
          onUpload={actions.openUpload}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <BulkActionBar
          selectedCount={selection.selectedCount}
          onDownload={actions.handleBulkDownload}
          onMove={actions.handleBulkMove}
          onDelete={() => void actions.handleBulkDelete()}
          onClear={selection.clear}
        />

        <FileDropZone onFilesDropped={actions.handleFilesDropped}>
          <div className="h-full overflow-y-auto scrollbar-thin">
            {showEmpty ? (
              isRoot ? (
                <FileEmptyStateRoot onUpload={actions.openUpload} />
              ) : (
                <FileEmptyStateFolder onUpload={actions.openUpload} />
              )
            ) : params.view === "grid" ? (
              <FileGrid {...sharedItemViewProps} />
            ) : (
              <FileListView
                {...sharedItemViewProps}
                isAllSelected={selection.isAllSelected}
                onSelectAll={selection.handleSelectAll}
              />
            )}
          </div>
        </FileDropZone>

        <StorageStatusBar
          itemCount={nodes.length}
          totalBytes={totalBytes}
          storageLimit={storageLimit}
        />
      </div>

      <FileUploadModal
        isOpen={actions.isUploadModalOpen}
        onClose={actions.closeUpload}
        onUpload={actions.handleUpload}
        initialFiles={
          actions.droppedFiles.length > 0 ? actions.droppedFiles : undefined
        }
      />

      <FilePreviewModal
        isOpen={actions.isPreviewOpen}
        node={previewNodeLive ?? null}
        onClose={actions.closePreview}
        onDelete={() => {
          if (previewNodeLive) void actions.handleDelete(previewNodeLive);
        }}
      />

      <RenameDialog
        key={actions.renameNodeId ?? "rename"}
        isOpen={actions.renameNodeId !== null}
        currentName={renameNodeLive?.name ?? ""}
        onRename={(name) => void actions.handleRenameConfirm(name)}
        onClose={() => actions.setRenameNodeId(null)}
      />

      <MoveFolderDialog
        isOpen={actions.isMoveDialogOpen}
        folders={folderNodes}
        currentFolderId={folderId}
        itemCount={actions.pendingMoveIds.length}
        onMove={(id) => void actions.handleMoveConfirm(id)}
        onClose={actions.closeMove}
      />
    </PageContainer>
  );
}
