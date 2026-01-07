"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Progress,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Skeleton,
  addToast,
} from "@heroui/react";
import {
  IconUpload,
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconDotsVertical,
  IconDownload,
  IconTrash,
  IconEye,
  IconAlertCircle,
  IconRefresh,
  IconLoader2,
} from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import FileUploadModal from "@/components/FileUploadModal";
import FilePreviewModal from "@/components/FilePreviewModal";

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
  });
}

const getFileIcon = (type: string) => {
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
};

export default function FilesPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalBytes, setTotalBytes] = useState(0);
  const [storageLimit, setStorageLimit] = useState(10 * 1024 * 1024 * 1024);

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/files");
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }

      const data = await response.json();
      setFiles(data.data);
      setTotalBytes(data.totalBytes);
      setStorageLimit(data.storageLimit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleFileUploaded = useCallback((file: UploadedFile) => {
    setFiles((prev) => [file, ...prev]);
    setTotalBytes((prev) => prev + file.size);
  }, []);

  const handleFileDeleted = useCallback((id: string) => {
    setFiles((prev) => {
      const deletedFile = prev.find((f) => f.id === id);
      if (deletedFile) {
        setTotalBytes((prevBytes) => prevBytes - deletedFile.size);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const handleViewFile = useCallback((file: UploadedFile) => {
    setSelectedFile(file);
    setIsPreviewModalOpen(true);
  }, []);

  const handleDeleteFile = useCallback(
    async (file: UploadedFile) => {
      setDeletingFileId(file.id);

      try {
        const response = await fetch(`/api/files/${file.id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to delete file");
        }

        handleFileDeleted(file.id);
        addToast({
          title: "Success",
          description: "File deleted successfully",
          color: "success",
        });
      } catch (err) {
        addToast({
          title: "Error",
          description:
            err instanceof Error ? err.message : "Failed to delete file",
          color: "danger",
        });
      } finally {
        setDeletingFileId(null);
      }
    },
    [handleFileDeleted]
  );

  const handleDownloadFile = useCallback((file: UploadedFile) => {
    // Mock download
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
  }, []);

  const storageUsedGB = totalBytes / (1024 * 1024 * 1024);
  const storageLimitGB = storageLimit / (1024 * 1024 * 1024);
  const storagePercent = (totalBytes / storageLimit) * 100;

  // Loading state
  if (isLoading) {
    return (
      <PageContainer
        title="Files"
        description="Manage your uploaded files and documents"
      >
        {/* Storage skeleton */}
        <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2 rounded" />
              <Skeleton className="h-2 w-full rounded" />
            </div>
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>

        {/* Table skeleton */}
        <div>
          <Skeleton className="h-6 w-24 mb-4 rounded" />
          <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
            <div className="bg-black/[0.02] dark:bg-white/[0.02] px-4 py-3 border-b border-black/10 dark:border-white/10">
              <div className="flex gap-4">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-16 rounded hidden md:block" />
                <Skeleton className="h-4 w-20 rounded hidden md:block" />
              </div>
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="px-4 py-4 border-b border-black/10 dark:border-white/10 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-4 w-48 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  // Error state
  if (error) {
    return (
      <PageContainer
        title="Files"
        description="Manage your uploaded files and documents"
      >
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
            <IconAlertCircle
              size={32}
              className="text-red-500 dark:text-red-400"
            />
          </div>
          <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
            Failed to load files
          </h3>
          <p className="text-neutral-500 dark:text-neutral-400 text-center mb-4">
            {error}
          </p>
          <Button
            onPress={fetchFiles}
            className="bg-black dark:bg-white text-white dark:text-black"
            startContent={<IconRefresh size={18} />}
          >
            Try again
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Files"
      description="Manage your uploaded files and documents"
    >
      {/* Storage info */}
      <div className="p-6 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Storage Usage
              </span>
              <span className="text-sm text-neutral-500">
                {storageUsedGB.toFixed(2)} GB / {storageLimitGB} GB
              </span>
            </div>
            <Progress
              value={storagePercent}
              size="sm"
              classNames={{
                track: "bg-black/10 dark:bg-white/10",
                indicator: "bg-black dark:bg-white",
              }}
            />
          </div>
          <Button
            onPress={() => setIsUploadModalOpen(true)}
            startContent={<IconUpload size={18} stroke={1.5} />}
            className="bg-black dark:bg-white text-white dark:text-black font-medium"
          >
            Upload File
          </Button>
        </div>
      </div>

      {/* Files table or empty state */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-black/10 dark:border-white/10 rounded-xl bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-4">
            <IconFile size={32} className="text-neutral-400" />
          </div>
          <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
            No files yet
          </h3>
          <p className="text-neutral-500 dark:text-neutral-400 text-center mb-4">
            Upload your first file to get started
          </p>
          <Button
            onPress={() => setIsUploadModalOpen(true)}
            className="bg-black dark:bg-white text-white dark:text-black"
            startContent={<IconUpload size={18} />}
          >
            Upload File
          </Button>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-medium text-black dark:text-white mb-4">
            Your Files ({files.length})
          </h3>
          <Table
            aria-label="Files table"
            classNames={{
              wrapper:
                "border border-black/10 dark:border-white/10 rounded-xl shadow-none bg-transparent",
              th: "bg-black/[0.02] dark:bg-white/[0.02] text-neutral-500 font-medium",
              td: "py-4",
              tr: "cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors",
            }}
          >
            <TableHeader>
              <TableColumn>NAME</TableColumn>
              <TableColumn className="hidden md:table-cell">SIZE</TableColumn>
              <TableColumn className="hidden md:table-cell">
                UPLOADED
              </TableColumn>
              <TableColumn width={60}>
                <span className="sr-only">Actions</span>
              </TableColumn>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const FileIcon = getFileIcon(file.type);
                const isDeleting = deletingFileId === file.id;
                return (
                  <TableRow
                    key={file.id}
                    onClick={() => handleViewFile(file)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {file.type === "image" && file.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={file.thumbnailUrl}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <FileIcon
                              size={20}
                              stroke={1.5}
                              className="text-neutral-600 dark:text-neutral-400"
                            />
                          )}
                        </div>
                        <span className="text-neutral-800 dark:text-neutral-200 font-medium">
                          {file.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-neutral-500 tabular-nums">
                        {formatFileSize(file.size)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-neutral-500">
                        {formatDate(file.uploadedAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Dropdown>
                        <DropdownTrigger>
                          <Button
                            isIconOnly
                            variant="light"
                            size="sm"
                            className="text-neutral-500"
                            onClick={(e) => e.stopPropagation()}
                            isDisabled={isDeleting}
                          >
                            {isDeleting ? (
                              <IconLoader2
                                size={18}
                                stroke={1.5}
                                className="animate-spin"
                              />
                            ) : (
                              <IconDotsVertical size={18} stroke={1.5} />
                            )}
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                          aria-label="File actions"
                          onAction={(key) => {
                            if (key === "view") handleViewFile(file);
                            if (key === "download") handleDownloadFile(file);
                            if (key === "delete") handleDeleteFile(file);
                          }}
                        >
                          <DropdownItem
                            key="view"
                            startContent={<IconEye size={16} stroke={1.5} />}
                          >
                            View
                          </DropdownItem>
                          <DropdownItem
                            key="download"
                            startContent={
                              <IconDownload size={16} stroke={1.5} />
                            }
                          >
                            Download
                          </DropdownItem>
                          <DropdownItem
                            key="delete"
                            className="text-danger"
                            color="danger"
                            startContent={<IconTrash size={16} stroke={1.5} />}
                          >
                            Delete
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Upload modal */}
      <FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onFileUploaded={handleFileUploaded}
      />

      {/* Preview modal */}
      <FilePreviewModal
        isOpen={isPreviewModalOpen}
        file={selectedFile}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setSelectedFile(null);
        }}
        onDelete={handleFileDeleted}
      />
    </PageContainer>
  );
}
