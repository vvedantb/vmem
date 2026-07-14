import { z } from "zod";
import { filesGetContent } from "./content";
import { deleteFile, getFile, listFiles, uploadFile } from "./fileOps";
import { toolSpec } from "./toolTypes";

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

export const filesToolSpecs = {
  files_list: toolSpec({
    name: "files_list",
    schema: filesListSchema,
    description:
      "List files and folders in the shared filesystem. Paths are '/'-separated (e.g. 'ai-images/cat.png'). Omit path to list the entire tree; pass a folder path to list its direct children. Files are user-wide and shared across all your AI clients.",
    errorLabel: "Files list failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return listFiles(h.ctx, h.clerkUserId, params.path);
    },
  }),
  files_get: toolSpec({
    name: "files_get",
    schema: filesGetSchema,
    description:
      "Read a file by path. Images up to 4 MB are returned as an inline image block (rendered directly); text files up to 100 KB are returned inline. A downloadUrl is always included for larger files. Call files_list first if you don't know the path.",
    errorLabel: "Files get failed",
    scopes: ["personal"],
    toContent: filesGetContent,
    async run(h, params): Promise<unknown> {
      return getFile(h.ctx, h.clerkUserId, params.path);
    },
  }),
  files_upload: toolSpec({
    name: "files_upload",
    schema: filesUploadSchema,
    description:
      "Save a file to the shared filesystem at the given path. Provide either contentBase64 (inline bytes, data: URL allowed) or sourceUrl (the server fetches and stores it — best for generated images). Missing parent folders are auto-created; an existing file at the path is overwritten. Max 10 MB. PDF and text-like files are automatically indexed into the memory graph and appear in memory_search/memory_retrieve.",
    errorLabel: "Files upload failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return uploadFile(h.ctx, {
        clerkId: h.clerkUserId,
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
      "Delete a file or folder by path. Folders are deleted recursively along with their stored contents. This is permanent.",
    errorLabel: "Files delete failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return deleteFile(h.ctx, h.clerkUserId, params.path);
    },
  }),
};
