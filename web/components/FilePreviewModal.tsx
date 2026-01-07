"use client";

import { useState, useCallback } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  addToast,
} from "@heroui/react";
import {
  IconX,
  IconDownload,
  IconTrash,
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconLoader2,
} from "@tabler/icons-react";

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  thumbnailUrl?: string;
  previewContent?: string;
}

interface FilePreviewModalProps {
  isOpen: boolean;
  file: UploadedFile | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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

function getFileIcon(type: string) {
  switch (type) {
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
      addToast({
        title: "Success",
        description: "File deleted successfully",
        color: "success",
      });
    } catch (error) {
      addToast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete file",
        color: "danger",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [file, onDelete, onClose]);

  const handleDownload = useCallback(() => {
    if (!file) return;

    // In a real app, this would download the actual file
    // For mock, we'll simulate by creating a text blob
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

    addToast({
      title: "Download Started",
      description: `Downloading ${file.name}`,
      color: "success",
    });
  }, [file]);

  const handleClose = useCallback(() => {
    setShowDeleteConfirm(false);
    onClose();
  }, [onClose]);

  if (!file) return null;

  const FileIcon = getFileIcon(file.type);

  return (
    <>
      {/* Main preview modal */}
      <Modal
        isOpen={isOpen && !showDeleteConfirm}
        onClose={handleClose}
        size="2xl"
        scrollBehavior="inside"
        classNames={{
          base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
          header: "border-b border-black/10 dark:border-white/10",
          body: "py-6",
          footer: "border-t border-black/10 dark:border-white/10",
        }}
      >
        <ModalContent>
          <ModalHeader className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0">
                <FileIcon
                  size={20}
                  className="text-neutral-600 dark:text-neutral-400"
                />
              </div>
              <span className="text-neutral-800 dark:text-neutral-200 text-lg font-semibold truncate">
                {file.name}
              </span>
            </div>
            <Button
              size="sm"
              variant="light"
              isIconOnly
              onPress={handleClose}
              className="text-neutral-500 flex-shrink-0"
            >
              <IconX size={18} />
            </Button>
          </ModalHeader>

          <ModalBody>
            <div className="space-y-6">
              {/* Preview area */}
              <div className="rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 overflow-hidden">
                {file.type === "image" && file.thumbnailUrl ? (
                  <div className="flex items-center justify-center min-h-[300px] p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.thumbnailUrl}
                      alt={file.name}
                      className="max-w-full max-h-[400px] object-contain rounded"
                    />
                  </div>
                ) : file.type === "pdf" ? (
                  <div className="flex flex-col items-center justify-center min-h-[300px] p-8 gap-4">
                    <IconFileTypePdf
                      size={64}
                      className="text-red-500 dark:text-red-400"
                    />
                    <div className="text-center">
                      <p className="text-neutral-800 dark:text-neutral-200 font-medium">
                        PDF Document
                      </p>
                      <p className="text-sm text-neutral-500 mt-1">
                        {file.previewContent ||
                          "PDF preview not available in mock mode"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-black/10 dark:border-white/10">
                      <FileIcon size={18} className="text-neutral-500" />
                      <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                        File Preview
                      </span>
                    </div>
                    {file.previewContent ? (
                      <pre className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap font-mono">
                        {file.previewContent}
                      </pre>
                    ) : (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">
                        Preview not available for this file type
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* File details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                    File Size
                  </p>
                  <p className="text-neutral-800 dark:text-neutral-200">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                    Type
                  </p>
                  <p className="text-neutral-800 dark:text-neutral-200">
                    {file.mimeType}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                    Uploaded
                  </p>
                  <p className="text-neutral-800 dark:text-neutral-200">
                    {formatDate(file.uploadedAt)}
                  </p>
                </div>
              </div>
            </div>
          </ModalBody>

          <ModalFooter className="flex justify-between">
            <Button
              variant="light"
              color="danger"
              onPress={() => setShowDeleteConfirm(true)}
              startContent={<IconTrash size={16} />}
            >
              Delete
            </Button>
            <Button
              onPress={handleDownload}
              className="bg-black dark:bg-white text-white dark:text-black"
              startContent={<IconDownload size={16} />}
            >
              Download
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        size="sm"
        classNames={{
          base: "bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10",
          header: "border-b border-black/10 dark:border-white/10",
          body: "py-6",
          footer: "border-t border-black/10 dark:border-white/10",
        }}
      >
        <ModalContent>
          <ModalHeader>
            <span className="text-neutral-800 dark:text-neutral-200">
              Delete File
            </span>
          </ModalHeader>
          <ModalBody>
            <p className="text-neutral-600 dark:text-neutral-400">
              Are you sure you want to delete &quot;{file.name}&quot;? This
              action cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="light"
              onPress={() => setShowDeleteConfirm(false)}
              isDisabled={isDeleting}
              className="text-neutral-600 dark:text-neutral-400"
            >
              Cancel
            </Button>
            <Button
              color="danger"
              onPress={handleDelete}
              isDisabled={isDeleting}
              startContent={
                isDeleting ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconTrash size={16} />
                )
              }
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
