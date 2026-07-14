"use client";

import { useQueryStates } from "nuqs";
import { VmemSpinner } from "@/components/svg-animations";
import type { FolderBreadcrumb } from "@/lib/file-types";
import PageContainer from "@/components/PageContainer";
import FileUploadModal from "@/components/FileUploadModal";
import FilePreviewModal from "@/components/FilePreviewModal";
import { filesSearchParams } from "./-searchParams";
import { sortFiles } from "./_utils";
import { useFileSelection } from "./_hooks/useFileSelection";
import { useFilesData } from "./_hooks/useFilesData";
import { useFilesActions } from "./_hooks/useFilesActions";
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

function buildBreadcrumbs(
  allFiles: { id: string; name: string; parentFolderId: string | null }[],
  folderId: string | null,
): FolderBreadcrumb[] {
  const crumbs: FolderBreadcrumb[] = [{ id: null, name: "Files" }];
  let currentId = folderId;
  const visited = new Set<string>();

  while (currentId !== null) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const folder = allFiles.find((f) => f.id === currentId);
    if (!folder) break;
    crumbs.push({ id: folder.id, name: folder.name });
    currentId = folder.parentFolderId;
  }

  if (crumbs.length <= 1) return crumbs;
  const root = crumbs.at(0);
  if (root === undefined) return crumbs;
  return [root, ...crumbs.slice(1).reverse()];
}

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

  const currentItems = sortFiles(
    allFiles.filter((f) => f.parentFolderId === (params.folderId ?? null)),
    params.sort,
    params.sortDir,
  );
  const selection = useFileSelection(currentItems.map((f) => f.id));
  const allFolders = allFiles.filter((f) => f.itemType === "folder");
  const breadcrumbs = buildBreadcrumbs(allFiles, params.folderId ?? null);

  function navigateToFolder(folderId: string | null) {
    void setParams({ folderId });
    selection.clear();
  }

  const actions = useFilesActions({
    folderId: params.folderId ?? null,
    allFiles,
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
    return (
      <PageContainer title="Files">
        <div className="flex h-full min-h-0 items-center justify-center">
          <VmemSpinner size={24} className="text-muted" />
        </div>
      </PageContainer>
    );
  }

  const isRoot = params.folderId === null;
  const showEmpty = currentItems.length === 0 && !actions.isCreatingFolder;

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
              <FileEmptyState
                variant={isRoot ? "root" : "folder"}
                onUpload={actions.openUpload}
              />
            ) : params.view === "grid" ? (
              <FileGrid
                items={currentItems}
                isCreatingFolder={actions.isCreatingFolder}
                isSelected={selection.isSelected}
                onClick={selection.handleClick}
                onCheckbox={selection.handleCheckbox}
                onOpen={actions.handleOpen}
                onDownload={actions.handleDownload}
                onMoveTo={actions.handleMoveTo}
                onRename={actions.handleRename}
                onDelete={(item) => void actions.handleDelete(item)}
                onNewFolderConfirm={(name) =>
                  void actions.handleNewFolderConfirm(name)
                }
                onNewFolderCancel={() => actions.setIsCreatingFolder(false)}
              />
            ) : (
              <FileListView
                items={currentItems}
                isCreatingFolder={actions.isCreatingFolder}
                isAllSelected={selection.isAllSelected}
                isSelected={selection.isSelected}
                onClick={selection.handleClick}
                onCheckbox={selection.handleCheckbox}
                onSelectAll={selection.handleSelectAll}
                onOpen={actions.handleOpen}
                onDownload={actions.handleDownload}
                onMoveTo={actions.handleMoveTo}
                onRename={actions.handleRename}
                onDelete={(item) => void actions.handleDelete(item)}
                onNewFolderConfirm={(name) =>
                  void actions.handleNewFolderConfirm(name)
                }
                onNewFolderCancel={() => actions.setIsCreatingFolder(false)}
              />
            )}
          </div>
        </FileDropZone>

        <StorageStatusBar
          itemCount={allFiles.length}
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
        file={actions.selectedFile}
        onClose={actions.closePreview}
        onDelete={(item) => void actions.handleDelete(item)}
      />

      <RenameDialog
        key={actions.renameTarget?.id ?? "rename"}
        isOpen={actions.renameTarget !== null}
        currentName={actions.renameTarget?.name ?? ""}
        onRename={(name) => void actions.handleRenameConfirm(name)}
        onClose={() => actions.setRenameTarget(null)}
      />

      <MoveFolderDialog
        isOpen={actions.isMoveDialogOpen}
        folders={allFolders}
        currentFolderId={params.folderId ?? null}
        itemCount={actions.pendingMoveIds.length}
        onMove={(id) => void actions.handleMoveConfirm(id)}
        onClose={actions.closeMove}
      />
    </PageContainer>
  );
}
