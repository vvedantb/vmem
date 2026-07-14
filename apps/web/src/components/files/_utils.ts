import {
  IconFile,
  IconPhoto,
  IconFileTypePdf,
  IconFileTypeDoc,
  IconFileTypeXls,
  IconFolder,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type { Id } from "@vmem/backend";
import type { FileCategory, FileTreeNode } from "./-types";
import type { FileSortField, SortDirection } from "./-searchParams";

/** Shared interaction props for list rows and grid cards. */
export type FileNodeChromeProps = {
  node: FileTreeNode;
  childCount: number;
  isSelected: boolean;
  onClick: (
    id: Id<"fileNodes">,
    e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean },
  ) => void;
  onCheckbox: (id: Id<"fileNodes">) => void;
  onOpen: (node: FileTreeNode) => void;
  onDownload: (node: FileTreeNode) => void;
  onMoveTo: (node: FileTreeNode) => void;
  onRename: (node: FileTreeNode) => void;
  onDelete: (node: FileTreeNode) => void;
};

export function fileCategoryFor(mimeType: string | undefined): FileCategory {
  const mime = mimeType ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("word") || mime === "application/msword") return "doc";
  if (mime.includes("sheet") || mime.includes("excel")) return "excel";
  return "generic";
}

export function fileCategoryForNode(node: FileTreeNode): FileCategory {
  return node.kind === "folder" ? "folder" : fileCategoryFor(node.mimeType);
}

export function childCountMap(
  nodes: FileTreeNode[],
): Map<Id<"fileNodes">, number> {
  const counts = new Map<Id<"fileNodes">, number>();
  for (const node of nodes) {
    if (node.parentId) {
      counts.set(node.parentId, (counts.get(node.parentId) ?? 0) + 1);
    }
  }
  return counts;
}

export function imageThumbnailUrl(node: FileTreeNode): string | null {
  if (node.kind !== "file" || fileCategoryFor(node.mimeType) !== "image") {
    return null;
  }
  return node.url;
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

export function formatDate(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString("en-US", {
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

// sort nodes with folders always first, then by the selected criteria
export function sortNodes(
  nodes: FileTreeNode[],
  sort: FileSortField,
  sortDir: SortDirection,
): FileTreeNode[] {
  const multiplier = sortDir === "asc" ? 1 : -1;

  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "folder" ? -1 : 1;
    }

    switch (sort) {
      case "name":
        return multiplier * a.name.localeCompare(b.name);
      case "size":
        return multiplier * ((a.size ?? 0) - (b.size ?? 0));
      case "date":
        return multiplier * (a.createdAt - b.createdAt);
      default:
        return 0;
    }
  });
}
