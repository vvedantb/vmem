import { z } from "zod";
import { filesGetContent } from "./content";
import {
  createFolder,
  deleteFile,
  getFile,
  listFiles,
  moveNodes,
  renameNode,
  uploadFile,
} from "./fileOps";
import { scopedClerk, toolSpec } from "./toolTypes";

const DRIVE_NOTE =
  "On the personal connector this is your personal Files; on the team connector it is the active team profile's shared drive.";

const filesListSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Folder path to list (e.g. 'ai-images'). Omit to list the entire tree.",
    ),
});

const filesGetSchema = z.object({
  path: z
    .string()
    .describe("File path, e.g. 'ai-images/cat.png' (from files_list)."),
});

const filesUploadSchema = z.object({
  path: z
    .string()
    .describe(
      "Destination path, e.g. 'ai-images/cat.png'. Missing folders are auto-created; an existing file at this path is overwritten.",
    ),
  contentBase64: z
    .string()
    .optional()
    .describe(
      "Base64-encoded file bytes (data: URL prefix allowed). Provide this OR sourceUrl.",
    ),
  sourceUrl: z
    .string()
    .optional()
    .describe(
      "URL the server fetches and stores. Best for generated images/large files. Provide this OR contentBase64.",
    ),
  mimeType: z
    .string()
    .optional()
    .describe(
      "MIME type, e.g. 'image/png'. Inferred from the data URL or response Content-Type when omitted.",
    ),
});

const filesDeleteSchema = z.object({
  path: z
    .string()
    .describe("File or folder path to delete. Folders delete recursively."),
});

const filesRenameSchema = z.object({
  path: z.string().describe("File or folder path to rename (from files_list)."),
  newName: z
    .string()
    .min(1)
    .describe(
      "New name for the last path segment, e.g. 'dog.png'. No '/'; use files_move to change folders.",
    ),
});

const filesMoveSchema = z.object({
  paths: z
    .array(z.string())
    .min(1)
    .max(100)
    .describe("File or folder paths to move (from files_list)."),
  targetFolderPath: z
    .string()
    .optional()
    .describe(
      "Existing destination folder path. Omit (or pass '') to move to the top level.",
    ),
});

const filesCreateFolderSchema = z.object({
  path: z
    .string()
    .describe(
      "Folder path to create, e.g. 'projects/2026'. Missing parent folders are created too; an existing folder is left as is.",
    ),
});

export const filesToolSpecs = {
  files_list: toolSpec({
    name: "files_list",
    schema: filesListSchema,
    description: `List files and folders in the shared filesystem. Paths are '/'-separated (e.g. 'ai-images/cat.png'). Omit path to list the entire tree; pass a folder path to list its direct children. Returns items (path, kind, size, mimeType, indexStatus, memoryId, updatedAt) plus totalBytes used and storageLimit in bytes. ${DRIVE_NOTE}`,
    errorLabel: "Files list failed",
    async run(h, params): Promise<unknown> {
      return listFiles(h.ctx, scopedClerk(h), params.path);
    },
  }),
  files_get: toolSpec({
    name: "files_get",
    schema: filesGetSchema,
    description:
      "Read a file by path. Images up to 4 MB are returned as an inline image block (rendered directly); text files up to 100 KB are returned inline. A downloadUrl is always included for larger files. Call files_list first if you don't know the path.",
    errorLabel: "Files get failed",
    toContent: filesGetContent,
    async run(h, params): Promise<unknown> {
      return getFile(h.ctx, scopedClerk(h), params.path);
    },
  }),
  files_upload: toolSpec({
    name: "files_upload",
    schema: filesUploadSchema,
    description: `Save a file to the shared filesystem at the given path. Provide either contentBase64 (inline bytes, data: URL allowed) or sourceUrl (the server fetches and stores it — best for generated images). Missing parent folders are auto-created; an existing file at the path is overwritten. Max 10 MB. PDF and text-like files are automatically indexed into the memory graph and appear in memory_search/memory_retrieve. ${DRIVE_NOTE}`,
    errorLabel: "Files upload failed",
    async run(h, params): Promise<unknown> {
      return uploadFile(h.ctx, {
        ...scopedClerk(h),
        path: params.path,
        contentBase64: params.contentBase64,
        sourceUrl: params.sourceUrl,
        mimeType: params.mimeType,
      });
    },
  }),
  files_delete: toolSpec({
    name: "files_delete",
    schema: filesDeleteSchema,
    description:
      "Delete a file or folder by path. Folders are deleted recursively along with their stored contents. This is permanent. On a team drive only the creator or a team owner can delete.",
    errorLabel: "Files delete failed",
    async run(h, params): Promise<unknown> {
      return deleteFile(h.ctx, scopedClerk(h), params.path);
    },
  }),
  files_create_folder: toolSpec({
    name: "files_create_folder",
    schema: filesCreateFolderSchema,
    description: `Create an empty folder at a path (like the web New folder button). Missing parent folders are created too. Returns created: false when the folder already existed. ${DRIVE_NOTE}`,
    errorLabel: "Files create folder failed",
    async run(h, params): Promise<unknown> {
      return createFolder(h.ctx, scopedClerk(h), params.path);
    },
  }),
  files_rename: toolSpec({
    name: "files_rename",
    schema: filesRenameSchema,
    description:
      "Rename a file or folder in place. A linked memory's title follows the new file name. Fails when the folder already holds that name.",
    errorLabel: "Files rename failed",
    async run(h, params): Promise<unknown> {
      return renameNode(h.ctx, scopedClerk(h), params.path, params.newName);
    },
  }),
  files_move: toolSpec({
    name: "files_move",
    schema: filesMoveSchema,
    description:
      "Move one or more files or folders into another folder (or the top level). A folder cannot move into itself or its own subfolders. Fails when the destination already holds one of the names.",
    errorLabel: "Files move failed",
    async run(h, params): Promise<unknown> {
      return moveNodes(
        h.ctx,
        scopedClerk(h),
        params.paths,
        params.targetFolderPath,
      );
    },
  }),
};
