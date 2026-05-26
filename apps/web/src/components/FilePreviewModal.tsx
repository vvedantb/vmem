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
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconX,
  IconLoader2,
} from "@tabler/icons-react";
import type { FileItem } from "@/lib/file-types";
import { formatFileSize } from "@/components/files/_utils";

interface FilePreviewModalProps {
  isOpen: boolean;
  file: FileItem | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getFileIcon(category: string) {
  switch (category) {
    case "pdf":
      return IconFileTypePdf;
    case "image":
      return IconPhoto;
    case "doc":
      return IconFileTypeDoc;
    case "excel":
      return IconFileTypeXls;
    default:
      return IconFile;
  }
}

export default function FilePreviewModal({
  isOpen,
  file,
  onClose,
  onDelete,
}: FilePreviewModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!file) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/files/${file.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete file");
      }

      onDelete(file.id);
      setShowDeleteConfirm(false);
      onClose();
      toast.success("File deleted successfully");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete file",
      );
    } finally {
      setIsDeleting(false);
    }
  }, [file, onDelete, onClose]);

  const handleDownload = useCallback(() => {
    if (!file) return;

    const content =
      file.previewContent ||
      `Mock content for ${file.name}\n\nThis is a simulated download.`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Downloading ${file.name}`);
  }, [file]);

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

  if (!file) return null;

  const FileIcon = getFileIcon(file.fileCategory);

  return (
    <>
      <Dialog
        open={isOpen && !showDeleteConfirm}
        onOpenChange={handleOpenChange}
      >
        <DialogContent className="max-w-2xl" hideCloseButton>
          <DialogHeader className="border-b border-border pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-surface-secondary border border-border flex items-center justify-center flex-shrink-0">
                  <FileIcon size={20} className="text-muted" />
                </div>
                <DialogTitle className="text-foreground text-lg font-semibold truncate">
                  {file.name}
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
            <div className="rounded-lg bg-surface-secondary/50 border border-border overflow-hidden">
              {file.fileCategory === "image" && file.thumbnailUrl ? (
                <div className="flex min-h-72 items-center justify-center p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.thumbnailUrl}
                    alt={file.name}
                    className="max-h-96 max-w-full rounded object-contain"
                  />
                </div>
              ) : file.fileCategory === "pdf" ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-4 p-8">
                  <IconFileTypePdf size={64} className="text-danger" />
                  <div className="text-center">
                    <p className="text-foreground font-medium">PDF Document</p>
                    <p className="text-sm text-muted mt-1">
                      {file.previewContent ||
                        "PDF preview not available in mock mode"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
                    <FileIcon size={18} className="text-muted" />
                    <span className="text-sm font-medium text-muted">
                      File Preview
                    </span>
                  </div>
                  {file.previewContent ? (
                    <pre className="text-sm text-foreground whitespace-pre-wrap font-mono">
                      {file.previewContent}
                    </pre>
                  ) : (
                    <p className="text-sm text-muted text-center py-8">
                      Preview not available for this file type
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted mb-1">File Size</p>
                <p className="text-foreground">{formatFileSize(file.size)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted mb-1">Type</p>
                <p className="text-foreground">{file.mimeType}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm font-medium text-muted mb-1">Uploaded</p>
                <p className="text-foreground">{formatDate(file.uploadedAt)}</p>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-4 flex justify-between sm:justify-between">
            <Button
              variant="ghost"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-danger hover:text-danger hover:bg-danger/10"
            >
              <IconTrash size={16} />
              Delete
            </Button>
            <Button
              onClick={handleDownload}
              className="bg-surface-tertiary text-accent-foreground"
            >
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
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-foreground">Delete File</DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <p className="text-muted">
              Are you sure you want to delete &quot;{file.name}&quot;? This
              action cannot be undone.
            </p>
          </div>

          <DialogFooter className="border-t border-border pt-4">
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
