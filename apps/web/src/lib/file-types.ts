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
  /** Neo4j memory id when this file is indexed into the memory graph. */
  memoryId?: string;
  /** Memory-graph indexing state (absent = uploaded before indexing shipped). */
  indexStatus?: "pending" | "indexed" | "skipped" | "failed";
}

/** Breadcrumb segment for folder navigation */
export interface FolderBreadcrumb {
  id: string | null;
  name: string;
}
