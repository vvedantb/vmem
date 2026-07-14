import type { api, Id } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";

export type FileListTree = NonNullable<
  FunctionReturnType<typeof api.files.listTree>
>;

export type FileTreeNode = FileListTree["nodes"][number];

export type FileCategory =
  | "pdf"
  | "image"
  | "doc"
  | "excel"
  | "generic"
  | "folder";

/** UI row for a file or folder in the files browser. */
export type FileItem = {
  id: Id<"fileNodes">;
  name: FileTreeNode["name"];
  itemType: FileTreeNode["kind"];
  mimeType: string;
  fileCategory: FileCategory;
  size: number;
  uploadedAt: string;
  parentFolderId: Id<"fileNodes"> | null;
  thumbnailUrl?: string;
  itemCount?: number;
  url?: string;
  memoryId?: FileTreeNode["memoryId"];
  indexStatus?: FileTreeNode["indexStatus"];
};

export type FolderBreadcrumb = {
  id: Id<"fileNodes"> | null;
  name: string;
};
