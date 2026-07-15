"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconDownload,
  IconTrash,
  IconFileTypePdf,
  IconX,
  IconLoader2,
} from "@tabler/icons-react";
import { formatDateTime } from "@vmem/shared";
import type { FileTreeNode } from "@/components/files/-types";
import {
  downloadFileNode,
  fileCategoryForNode,
  formatFileSize,
  getFileIcon,
  imageThumbnailUrl,
} from "@/components/files/_utils";

interface FilePreviewModalProps {
  isOpen: boolean;
  node: FileTreeNode | null;
  onClose: () => void;
  onDelete: (node: FileTreeNode) => Promise<void> | void;
}

export default function FilePreviewModal({
  isOpen,
  node,
  onClose,
  onDelete,
}: FilePreviewModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!node) return;

    setIsDeleting(true);

    try {
      await onDelete(node);
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete file",
      );
    } finally {
      setIsDeleting(false);
    }
  }, [node, onDelete, onClose]);

  const handleDownload = useCallback(() => {
    if (!node) return;
    if (!downloadFileNode(node)) {
      toast.error("Download URL unavailable");
      return;
    }
    toast.success(`Downloading ${node.name}`);
  }, [node]);

  const handleClose = useCallback(() => {
    setShowDeleteConfirm(false);
    onClose();
  }, [onClose]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleClose();
    },
    [handleClose],
  );

  const handleDeleteConfirmOpenChange = useCallback((open: boolean) => {
    if (!open) setShowDeleteConfirm(false);
  }, []);

  if (!node) return null;

  const fileCategory = fileCategoryForNode(node);
  const FileIcon = getFileIcon(fileCategory);
  const thumbnailUrl = imageThumbnailUrl(node);

  return (
    <>
      <Dialog
        open={isOpen && !showDeleteConfirm}
        onOpenChange={handleOpenChange}
      >
        <DialogContent className="max-w-2xl" hideCloseButton>
          <DialogHeader className="border-b border-separator pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-surface-secondary flex items-center justify-center flex-shrink-0">
                  <FileIcon size={20} className="text-muted" />
                </div>
                <DialogTitle className="text-foreground text-lg font-semibold truncate">
                  {node.name}
                </DialogTitle>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={handleClose}
                className="text-muted flex-shrink-0"
              >
                <IconX size={18} />
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div className="rounded-lg bg-surface-secondary/50 overflow-hidden">
              {fileCategory === "image" && thumbnailUrl ? (
                <div className="flex min-h-72 items-center justify-center p-4">
                  <img
                    src={thumbnailUrl}
                    alt={node.name}
                    className="max-h-96 max-w-full rounded object-contain"
                  />
                </div>
              ) : fileCategory === "pdf" ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8">
                  <IconFileTypePdf size={64} className="text-danger" />
                  <div className="text-center">
                    <p className="text-foreground font-medium">PDF Document</p>
                    <p className="text-sm text-muted mt-1">
                      PDF preview not available
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-separator">
                    <FileIcon size={18} className="text-muted" />
                    <span className="text-sm font-medium text-muted">
                      File Preview
                    </span>
                  </div>
                  <p className="text-sm text-muted text-center py-8">
                    Preview not available for this file type
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted mb-1">File Size</p>
                <p className="text-foreground">
                  {formatFileSize(node.size ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted mb-1">Type</p>
                <p className="text-foreground">{node.mimeType ?? "Unknown"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-muted mb-1">Uploaded</p>
                <p className="text-foreground">
                  {formatDateTime(node.createdAt)}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-separator pt-4 flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-danger hover:text-danger hover:bg-danger/10"
            >
              <IconTrash size={16} />
              Delete
            </Button>
            <Button onClick={handleDownload}>
              <IconDownload size={16} />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteConfirm}
        onOpenChange={handleDeleteConfirmOpenChange}
      >
        <DialogContent className="max-w-sm" hideCloseButton>
          <DialogHeader className="border-b border-separator pb-4">
            <DialogTitle className="text-foreground">Delete File</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <p className="text-muted">
              Are you sure you want to delete &quot;{node.name}&quot;? This
              action cannot be undone.
            </p>
          </div>

          <DialogFooter className="border-t border-separator pt-4">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
              className="text-muted"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconTrash size={16} />
              )}
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
