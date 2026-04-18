import {
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconFolder,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type { FileCategory, FileItem } from "@/lib/file-types";
import type { FileSortField, SortDirection } from "./-searchParams";

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getFileIcon(category: FileCategory): TablerIcon {
  switch (category) {
    case "pdf":
      return IconFileTypePdf;
    case "image":
      return IconPhoto;
    case "doc":
      return IconFileTypeDoc;
    case "excel":
      return IconFileTypeXls;
    case "folder":
      return IconFolder;
    default:
      return IconFile;
  }
}

/** Sort files with folders always first, then by the selected criteria */
export function sortFiles(
  files: FileItem[],
  sort: FileSortField,
  sortDir: SortDirection,
): FileItem[] {
  const multiplier = sortDir === "asc" ? 1 : -1;

  return [...files].sort((a, b) => {
    // Folders always first
    if (a.itemType !== b.itemType) {
      return a.itemType === "folder" ? -1 : 1;
    }

    switch (sort) {
      case "name":
        return multiplier * a.name.localeCompare(b.name);
      case "size":
        return multiplier * (a.size - b.size);
      case "date":
        return (
          multiplier *
          (new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime())
        );
      default:
        return 0;
    }
  });
}
