"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Progress,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconUpload,
  IconX,
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconLoader2,
  IconCheck,
  IconTrash,
} from "@tabler/icons-react";
import { formatFileSize } from "@/components/files/_utils";

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Persist a single file (Convex upload-url flow lives in the caller). */
  onUpload: (file: File) => Promise<void>;
  initialFiles?: File[];
}

interface QueuedFile {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "complete" | "error";
  error?: string;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return IconPhoto;
  if (mimeType === "application/pdf") return IconFileTypePdf;
  return IconFile;
}

export default function FileUploadModal({
  isOpen,
  onClose,
  onUpload,
  initialFiles,
}: FileUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Pre-populate queue when initialFiles are provided (e.g. from drop zone)
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const filesArray = Array.from(newFiles);
    const newQueuedFiles: QueuedFile[] = filesArray.map((file) => ({
      file,
      progress: 0,
      status: "pending" as const,
    }));
    setQueuedFiles((prev) => [...prev, ...newQueuedFiles]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        addFiles(files);
      }
    },
    [addFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        addFiles(files);
      }
      e.target.value = "";
    },
    [addFiles],
  );

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

    let successCount = 0;
    for (let i = 0; i < queuedFiles.length; i++) {
      const queued = queuedFiles.at(i);
      if (queued?.status !== "pending") continue;
      const success = await uploadFile(queued, i);
      if (success) successCount++;
    }

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
      setIsDragging(false);
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
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${
                isDragging
                  ? "border-accent bg-accent/5"
                  : "border-border hover:bg-surface-secondary/35"
              }
            `}
          >
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
            />
            <div className="flex flex-col items-center gap-3">
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                  isDragging ? "bg-accent/15" : "bg-surface-secondary"
                }`}
              >
                <IconUpload
                  size={24}
                  className={isDragging ? "text-accent" : "text-muted"}
                />
              </div>
              <div>
                <p className="text-foreground font-medium">
                  {isDragging ? "Drop files here" : "Drag and drop files here"}
                </p>
                <p className="text-sm text-muted mt-1">or click to browse</p>
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
                  const FileIcon = getFileIcon(queuedFile.file.type);
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
