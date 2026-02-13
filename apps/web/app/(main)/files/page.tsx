"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Progress,
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Skeleton,
} from "@vmem/ui";
import { toast } from "sonner";
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
        toast.success("File deleted successfully");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to delete file",
        );
      } finally {
        setDeletingFileId(null);
      }
    },
    [handleFileDeleted],
  );

  const handleDownloadFile = useCallback((file: UploadedFile) => {
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
  }, []);

  const storageUsedGB = totalBytes / (1024 * 1024 * 1024);
  const storageLimitGB = storageLimit / (1024 * 1024 * 1024);
  const storagePercent = (totalBytes / storageLimit) * 100;

  if (isLoading) {
    return (
      <PageContainer
        title="Files"
        description="Manage your uploaded files and documents"
      >
        <div className="p-6 rounded-xl border border-border bg-muted/50">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2 rounded" />
              <Skeleton className="h-2 w-full rounded" />
            </div>
            <Skeleton className="h-10 w-28 rounded-lg" />
          </div>
        </div>

        <div>
          <Skeleton className="h-6 w-24 mb-4 rounded" />
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 border-b border-border">
              <div className="flex gap-4">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-16 rounded hidden md:block" />
                <Skeleton className="h-4 w-20 rounded hidden md:block" />
              </div>
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="px-4 py-4 border-b border-border last:border-b-0"
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

  if (error) {
    return (
      <PageContainer
        title="Files"
        description="Manage your uploaded files and documents"
      >
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <IconAlertCircle size={32} className="text-destructive" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            Failed to load files
          </h3>
          <p className="text-muted-foreground text-center mb-4">{error}</p>
          <Button
            onClick={fetchFiles}
            className="bg-primary text-primary-foreground"
          >
            <IconRefresh size={18} />
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
      <div className="p-6 rounded-xl border border-border bg-muted/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">
                Storage Usage
              </span>
              <span className="text-sm text-muted-foreground">
                {storageUsedGB.toFixed(2)} GB / {storageLimitGB} GB
              </span>
            </div>
            <Progress value={storagePercent} className="h-2 bg-muted" />
          </div>
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-primary text-primary-foreground font-medium"
          >
            <IconUpload size={18} stroke={1.5} />
            Upload File
          </Button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border border-border rounded-xl bg-muted/50">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <IconFile size={32} className="text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            No files yet
          </h3>
          <p className="text-muted-foreground text-center mb-4">
            Upload your first file to get started
          </p>
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-primary text-primary-foreground"
          >
            <IconUpload size={18} />
            Upload File
          </Button>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-medium text-foreground mb-4">
            Your Files ({files.length})
          </h3>
          <div className="border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-muted-foreground font-medium">
                    NAME
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-muted-foreground font-medium">
                    SIZE
                  </TableHead>
                  <TableHead className="hidden md:table-cell text-muted-foreground font-medium">
                    UPLOADED
                  </TableHead>
                  <TableHead className="w-[60px]">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => {
                  const FileIcon = getFileIcon(file.type);
                  const isDeleting = deletingFileId === file.id;
                  return (
                    <TableRow
                      key={file.id}
                      className="cursor-pointer hover:bg-accent"
                      onClick={() => handleViewFile(file)}
                    >
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0 overflow-hidden">
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
                                className="text-muted-foreground"
                              />
                            )}
                          </div>
                          <span className="text-foreground font-medium">
                            {file.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-4">
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {formatFileSize(file.size)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell py-4">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(file.uploadedAt)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground"
                              onClick={(e) => e.stopPropagation()}
                              disabled={isDeleting}
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
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleViewFile(file)}
                            >
                              <IconEye size={16} stroke={1.5} />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDownloadFile(file)}
                            >
                              <IconDownload size={16} stroke={1.5} />
                              Download
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDeleteFile(file)}
                            >
                              <IconTrash size={16} stroke={1.5} />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <FileUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onFileUploaded={handleFileUploaded}
      />

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
