import type { TablerIcon } from "@tabler/icons-react";

export type FileCategory =
  | "pdf"
  | "image"
  | "doc"
  | "excel"
  | "generic"
  | "folder";

export interface FileItem {
  id: string;
  name: string;
  itemType: "file" | "folder";
  mimeType: string;
  fileCategory: FileCategory;
  size: number;
  uploadedAt: string;
  parentFolderId: string | null;
  thumbnailUrl?: string;
  previewContent?: string;
  itemCount?: number;
  /** Convex serving URL for files (download + image preview). */
  url?: string;
}

/** Breadcrumb segment for folder navigation */
export interface FolderBreadcrumb {
  id: string | null;
  name: string;
}

/** Icon resolver type used across file components */
export type FileIconResolver = (category: FileCategory) => TablerIcon;
