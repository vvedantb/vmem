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
  // convex serving URL for files (download + image preview)
  url?: string;
  // neo4j memory id when this file is indexed into the memory graph
  memoryId?: string;
  // memory-graph indexing state (absent = uploaded before indexing shipped)
  indexStatus?: "pending" | "indexed" | "skipped" | "failed";
}

// breadcrumb segment for folder navigation
export interface FolderBreadcrumb {
  id: string | null;
  name: string;
}
