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

export type FolderBreadcrumb = {
  id: Id<"fileNodes"> | null;
  name: string;
};
