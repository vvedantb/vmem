"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Progress,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconUpload,
  IconX,
  IconLoader2,
  IconCheck,
  IconTrash,
} from "@tabler/icons-react";
import { formatFileSize, getFileIconForMime } from "@/components/files/_utils";

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  // persist a single file (Convex upload-url flow lives in the caller)
  onUpload: (file: File) => Promise<void>;
  initialFiles?: File[];
}

interface QueuedFile {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
}

export default function FileUploadModal({
  isOpen,
  onClose,
  onUpload,
  initialFiles,
}: FileUploadModalProps) {
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // pre-populate queue when initialFiles are provided (e.g. from drop zone)
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      const newQueued: QueuedFile[] = initialFiles.map((file) => ({
        file,
        progress: 0,
        status: "pending" as const,
      }));
      setQueuedFiles((prev) => [...prev, ...newQueued]);
    }
  }, [isOpen, initialFiles]);

  const addFiles = useCallback((newFiles: File[]) => {
    const newQueuedFiles: QueuedFile[] = newFiles.map((file) => ({
      file,
      progress: 0,
      status: "pending" as const,
    }));
    setQueuedFiles((prev) => [...prev, ...newQueuedFiles]);
  }, []);

  const { getRootProps, getInputProps } = useDropzone({
    multiple: true,
    disabled: isUploading,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) addFiles(acceptedFiles);
    },
  });

  const removeQueuedFile = useCallback((index: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadFile = useCallback(
    async (queuedFile: QueuedFile, index: number): Promise<boolean> => {
      setQueuedFiles((prev) =>
        prev.map((f, i) =>
          i === index ? { ...f, status: "uploading" as const } : f,
        ),
      );

      const progressInterval = setInterval(() => {
        setQueuedFiles((prev) =>
          prev.map((f, i) =>
            i === index && f.status === "uploading" && f.progress < 90
              ? { ...f, progress: f.progress + 10 }
              : f,
          ),
        );
      }, 200);

      try {
        await onUpload(queuedFile.file);

        clearInterval(progressInterval);

        setQueuedFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? { ...f, progress: 100, status: "complete" as const }
              : f,
          ),
        );

        return true;
      } catch (error) {
        clearInterval(progressInterval);
        setQueuedFiles((prev) =>
          prev.map((f, i) =>
            i === index
              ? {
                  ...f,
                  status: "error" as const,
                  error:
                    error instanceof Error ? error.message : "Upload failed",
                }
              : f,
          ),
        );
        return false;
      }
    },
    [onUpload],
  );

  const handleUploadAll = useCallback(async () => {
    const pendingFiles = queuedFiles.filter((f) => f.status === "pending");
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    const pending = queuedFiles
      .map((queued, index) => ({ queued, index }))
      .filter(({ queued }) => queued.status === "pending");

    const results = await Promise.all(
      pending.map(({ queued, index }) => uploadFile(queued, index)),
    );
    const successCount = results.filter(Boolean).length;

    setIsUploading(false);

    if (successCount > 0) {
      toast.success(
        `Successfully uploaded ${successCount} file${successCount !== 1 ? "s" : ""}`,
      );
    }
  }, [queuedFiles, uploadFile]);

  const handleClose = useCallback(() => {
    if (!isUploading) {
      setQueuedFiles([]);
      onClose();
    }
  }, [isUploading, onClose]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleClose();
    },
    [handleClose],
  );

  const pendingCount = queuedFiles.filter((f) => f.status === "pending").length;
  const completeCount = queuedFiles.filter(
    (f) => f.status === "complete",
  ).length;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-xl"
        hideCloseButton
        onInteractOutside={(e) => {
          if (isUploading) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isUploading) e.preventDefault();
        }}
      >
        <DialogHeader className="border-b border-separator pb-4">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-foreground">Upload Files</DialogTitle>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleClose}
              disabled={isUploading}
              className="text-muted flex-shrink-0"
            >
              <IconX size={18} />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div
            {...getRootProps({
              className:
                "relative cursor-pointer rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:bg-surface-secondary/35",
            })}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
                <IconUpload size={24} className="text-muted" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  Choose files to upload
                </p>
                <p className="mt-1 text-sm text-muted">
                  Or drop files anywhere on the files page
                </p>
              </div>
            </div>
          </div>

          {queuedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted">
                {pendingCount > 0
                  ? `${pendingCount} file${pendingCount !== 1 ? "s" : ""} ready to upload`
                  : completeCount > 0
                    ? `${completeCount} file${completeCount !== 1 ? "s" : ""} uploaded`
                    : "Files"}
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {queuedFiles.map((queuedFile, index) => {
                  const FileIcon = getFileIconForMime(queuedFile.file.type);
                  return (
                    <div
                      key={`${queuedFile.file.name}-${index}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-surface-secondary/50"
                    >
                      <div className="w-10 h-10 rounded-lg bg-surface-secondary flex items-center justify-center flex-shrink-0">
                        <FileIcon size={20} className="text-muted" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground font-medium truncate">
                          {queuedFile.file.name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatFileSize(queuedFile.file.size)}
                        </p>
                        {queuedFile.status === "uploading" && (
                          <Progress
                            value={queuedFile.progress}
                            className="mt-2 h-1.5 bg-surface-secondary"
                          />
                        )}
                        {queuedFile.status === "error" && (
                          <p className="text-xs text-danger mt-1">
                            {queuedFile.error}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {queuedFile.status === "pending" && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => removeQueuedFile(index)}
                            disabled={isUploading}
                            className="text-muted hover:text-danger"
                          >
                            <IconTrash size={16} />
                          </Button>
                        )}
                        {queuedFile.status === "uploading" && (
                          <IconLoader2
                            size={20}
                            className="text-muted animate-spin"
                          />
                        )}
                        {queuedFile.status === "complete" && (
                          <IconCheck size={20} className="text-success" />
                        )}
                        {queuedFile.status === "error" && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => removeQueuedFile(index)}
                            className="text-danger"
                          >
                            <IconX size={16} />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-separator pt-4">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isUploading}
            className="text-muted"
          >
            {completeCount > 0 && pendingCount === 0 ? "Done" : "Cancel"}
          </Button>
          {pendingCount > 0 && (
            <Button
              onClick={handleUploadAll}
              disabled={isUploading || pendingCount === 0}
            >
              {isUploading ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconUpload size={16} />
              )}
              {isUploading
                ? "Uploading..."
                : `Upload ${pendingCount} file${pendingCount !== 1 ? "s" : ""}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
