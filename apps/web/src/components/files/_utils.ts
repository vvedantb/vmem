import {
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconFolder,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type { FileCategory, FileItem } from "./-types";
import type { FileSortField, SortDirection } from "./-searchParams";

/** Shared interaction props for list rows and grid cards. */
export type FileItemChromeProps = {
  item: FileItem;
  isSelected: boolean;
  onClick: (
    id: string,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => void;
  onCheckbox: (id: string) => void;
  onOpen: (item: FileItem) => void;
  onDownload: (item: FileItem) => void;
  onMoveTo: (item: FileItem) => void;
  onRename: (item: FileItem) => void;
  onDelete: (item: FileItem) => void;
};

export function imageThumbnailUrl(item: FileItem): string | null {
  if (item.itemType !== "file" || item.fileCategory !== "image") return null;
  return item.thumbnailUrl ?? null;
}

export function formatItemCount(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

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

// sort files with folders always first, then by the selected criteria
export function sortFiles(
  files: FileItem[],
  sort: FileSortField,
  sortDir: SortDirection,
): FileItem[] {
  const multiplier = sortDir === "asc" ? 1 : -1;

  return [...files].sort((a, b) => {
    // folders always first
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
