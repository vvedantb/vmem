import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { McpScope } from "../profiles/mcpAccess";
import {
  normalizePathSegments,
  nodePath,
  resolveByPath,
  isImageMime,
  isTextualMime,
} from "../files/lib";
import {
  decodeBase64Bytes,
  encodeBase64Bytes,
  toArrayBuffer,
} from "../lib/base64";

// inline content caps. mcp tool args/results are json, so bytes ride as base64
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (Convex 16 MiB action-arg limit w/ base64 overhead)
const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024; // return image bytes inline up to 4 MB
const MAX_INLINE_TEXT_BYTES = 100 * 1024; // return text inline up to 100 KB

// the drive a file tool acts on: personal files, or the active team's drive
export type McpFileScope = { clerkId: string; scope: McpScope };

export type FileListItem = {
  path: string;
  kind: "folder" | "file";
  size: number | null;
  mimeType: string | null;
  // memory indexing of PDF / text files: pending, indexed, skipped or failed
  indexStatus: Doc<"fileNodes">["indexStatus"] | null;
  // the memory the file was indexed into
  memoryId: string | null;
  updatedAt: number;
};

export type FileStorageResult = {
  totalBytes: number;
  storageLimit: number;
  fileCount: number;
};

export type FileGetResult = {
  path: string;
  kind: "file";
  mimeType: string;
  size: number;
  downloadUrl: string | null;
  // present for images ≤ 4 mb, lets the agent render the image directly
  contentBase64?: string;
  // present for text like files ≤ 100 kb
  text?: string;
};

export type FileUploadResult = {
  path: string;
  kind: "file";
  mimeType: string;
  size: number;
};

export type FileDeleteResult = {
  path: string;
  deletedCount: number;
};

export type FileFolderResult = {
  path: string;
  kind: "folder";
  created: boolean;
};

export type FileRenameResult = {
  path: string;
  previousPath: string;
};

export type FileMoveResult = {
  moved: Array<{ from: string; to: string }>;
};

// decode base64 (tolerating a data-url prefix) into a backing ArrayBuffer
function decodeBase64(input: string): {
  buffer: ArrayBuffer;
  dataUrlMime?: string;
} {
  let payload = input;
  let dataUrlMime: string | undefined;
  if (payload.startsWith("data:")) {
    const commaIndex = payload.indexOf(",");
    if (commaIndex !== -1) {
      const header = payload.slice(5, commaIndex); // e.g. "image/png;base64"
      dataUrlMime = header.split(";")[0] || undefined;
      payload = payload.slice(commaIndex + 1);
    }
  }
  return { buffer: toArrayBuffer(decodeBase64Bytes(payload)), dataUrlMime };
}

function toListItem(
  nodes: Array<Doc<"fileNodes">>,
  node: Doc<"fileNodes">,
): FileListItem {
  return {
    path: nodePath(nodes, node),
    kind: node.kind,
    size: node.kind === "file" ? (node.size ?? 0) : null,
    mimeType: node.kind === "file" ? (node.mimeType ?? null) : null,
    indexStatus: node.indexStatus ?? null,
    memoryId: node.memoryId ?? null,
    updatedAt: node.updatedAt,
  };
}

async function listFileTree(ctx: ActionCtx, scope: McpFileScope) {
  return ctx.runQuery(internal.files.listByClerkIdInternal, scope);
}

async function listFileNodes(
  ctx: ActionCtx,
  scope: McpFileScope,
): Promise<Array<Doc<"fileNodes">>> {
  return (await listFileTree(ctx, scope)).nodes;
}

function requireSegments(path: string): string[] {
  const segments = normalizePathSegments(path);
  if (segments.length === 0) {
    throw new Error("Path is required");
  }
  return segments;
}

// paths address nodes by name, so one folder must not hold two equal names
function assertNameFree(
  nodes: Array<Doc<"fileNodes">>,
  parentId: Id<"fileNodes"> | undefined,
  name: string,
  exceptId?: Id<"fileNodes">,
): void {
  const taken = nodes.some(
    (node) =>
      node.parentId === parentId && node.name === name && node._id !== exceptId,
  );
  if (taken) {
    throw new Error(`"${name}" already exists in the destination folder`);
  }
}

function requireNodeAtPath(
  nodes: Array<Doc<"fileNodes">>,
  path: string,
): { node: Doc<"fileNodes">; segments: string[] } {
  const segments = normalizePathSegments(path);
  const node = resolveByPath(nodes, segments);
  if (!node) {
    throw new Error(`Path not found: ${segments.join("/")}`);
  }
  return { node, segments };
}

function requireFolderAtPath(
  nodes: Array<Doc<"fileNodes">>,
  path: string,
): Doc<"fileNodes"> {
  const { node } = requireNodeAtPath(nodes, path);
  if (node.kind !== "folder") {
    throw new Error("Path is a file, not a folder");
  }
  return node;
}

export async function listFiles(
  ctx: ActionCtx,
  scope: McpFileScope,
  path: string | undefined,
): Promise<FileListItem[]> {
  const nodes = await listFileNodes(ctx, scope);

  const folder =
    path !== undefined && normalizePathSegments(path).length > 0
      ? requireFolderAtPath(nodes, path)
      : undefined;
  const listed =
    folder === undefined
      ? nodes
      : nodes.filter((node) => node.parentId === folder._id);
  return listed.map((node) => toListItem(nodes, node));
}

export async function getFileStorage(
  ctx: ActionCtx,
  scope: McpFileScope,
): Promise<FileStorageResult> {
  const { nodes, totalBytes, storageLimit } = await listFileTree(ctx, scope);
  return {
    totalBytes,
    storageLimit,
    fileCount: nodes.filter((node) => node.kind === "file").length,
  };
}

export async function getFile(
  ctx: ActionCtx,
  scope: McpFileScope,
  path: string,
): Promise<FileGetResult> {
  const nodes = await listFileNodes(ctx, scope);
  const { node } = requireNodeAtPath(nodes, path);
  if (node.kind !== "file") {
    throw new Error("Path is a folder, not a file");
  }

  const mimeType = node.mimeType ?? "application/octet-stream";
  const size = node.size ?? 0;
  const downloadUrl = node.storageId
    ? await ctx.storage.getUrl(node.storageId)
    : null;

  const result: FileGetResult = {
    path: nodePath(nodes, node),
    kind: "file",
    mimeType,
    size,
    downloadUrl,
  };

  if (node.storageId) {
    if (isImageMime(mimeType) && size <= MAX_INLINE_IMAGE_BYTES) {
      const blob = await ctx.storage.get(node.storageId);
      if (blob) {
        const buffer = await blob.arrayBuffer();
        result.contentBase64 = encodeBase64Bytes(new Uint8Array(buffer));
      }
    } else if (isTextualMime(mimeType) && size <= MAX_INLINE_TEXT_BYTES) {
      const blob = await ctx.storage.get(node.storageId);
      if (blob) {
        result.text = await blob.text();
      }
    }
  }

  return result;
}

// Bytes for an MCP upload: exactly one of base64 or a URL, at most 10 MB.
export async function readUploadBlob(args: {
  contentBase64?: string;
  sourceUrl?: string;
  mimeType?: string;
}): Promise<{ blob: Blob; mimeType: string }> {
  const contentBase64 = args.contentBase64;
  const sourceUrl = args.sourceUrl;
  const hasBase64 = contentBase64 !== undefined && contentBase64.length > 0;
  const hasUrl = sourceUrl !== undefined && sourceUrl.length > 0;
  if (hasBase64 === hasUrl) {
    throw new Error("Provide exactly one of contentBase64 or sourceUrl");
  }

  let blob: Blob;
  let mimeType: string;

  if (hasUrl && sourceUrl !== undefined) {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch sourceUrl (${response.status} ${response.statusText})`,
      );
    }
    blob = await response.blob();
    const headerMime = response.headers.get("content-type");
    mimeType =
      args.mimeType ??
      (headerMime ? headerMime.split(";")[0] : null) ??
      blob.type ??
      "application/octet-stream";
  } else if (hasBase64 && contentBase64 !== undefined) {
    const { buffer, dataUrlMime } = decodeBase64(contentBase64);
    mimeType = args.mimeType ?? dataUrlMime ?? "application/octet-stream";
    blob = new Blob([buffer], { type: mimeType });
  } else {
    throw new Error("Provide exactly one of contentBase64 or sourceUrl");
  }

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File too large (${blob.size} bytes); max is ${MAX_UPLOAD_BYTES} bytes`,
    );
  }
  return { blob, mimeType };
}

export async function uploadFile(
  ctx: ActionCtx,
  args: McpFileScope & {
    path: string;
    contentBase64?: string;
    sourceUrl?: string;
    mimeType?: string;
  },
): Promise<FileUploadResult> {
  const segments = requireSegments(args.path);
  const { blob, mimeType } = await readUploadBlob(args);

  const storageId = await ctx.storage.store(blob);

  try {
    await ctx.runMutation(internal.files.upsertFileByPathInternal, {
      clerkId: args.clerkId,
      scope: args.scope,
      segments,
      storageId,
      mimeType,
      size: blob.size,
    });
  } catch (err) {
    // roll back the orphaned blob if recording the node failed
    await ctx.runMutation(internal.files.deleteStorageInternal, {
      storageId,
    });
    throw err;
  }

  return {
    path: segments.join("/"),
    kind: "file",
    mimeType,
    size: blob.size,
  };
}

export async function deleteFile(
  ctx: ActionCtx,
  scope: McpFileScope,
  path: string,
): Promise<FileDeleteResult> {
  const nodes = await listFileNodes(ctx, scope);
  const { node } = requireNodeAtPath(nodes, path);
  const resolvedPath = nodePath(nodes, node);
  const { deletedCount } = await ctx.runMutation(
    internal.files.deleteByIdForClerkInternal,
    { ...scope, nodeId: node._id },
  );
  return { path: resolvedPath, deletedCount };
}

// mkdir -p: missing parent folders are created too
export async function createFolder(
  ctx: ActionCtx,
  scope: McpFileScope,
  path: string,
): Promise<FileFolderResult> {
  const segments = requireSegments(path);
  const { created } = await ctx.runMutation(
    internal.files.createFolderByPathInternal,
    { ...scope, segments },
  );
  return { path: segments.join("/"), kind: "folder", created };
}

export async function renameNode(
  ctx: ActionCtx,
  scope: McpFileScope,
  path: string,
  newName: string,
): Promise<FileRenameResult> {
  const name = newName.trim();
  if (name.length === 0 || name.includes("/")) {
    throw new Error("newName must be a non-empty name without '/'");
  }
  const nodes = await listFileNodes(ctx, scope);
  const { node } = requireNodeAtPath(nodes, path);
  assertNameFree(nodes, node.parentId, name, node._id);
  const previousPath = nodePath(nodes, node);
  await ctx.runMutation(internal.files.renameByClerkIdInternal, {
    ...scope,
    nodeId: node._id,
    name,
  });
  return {
    path: nodePath(nodes, { ...node, name }),
    previousPath,
  };
}

export async function moveNodes(
  ctx: ActionCtx,
  scope: McpFileScope,
  paths: string[],
  targetFolderPath: string | undefined,
): Promise<FileMoveResult> {
  const nodes = await listFileNodes(ctx, scope);
  const target =
    targetFolderPath !== undefined &&
    normalizePathSegments(targetFolderPath).length > 0
      ? requireFolderAtPath(nodes, targetFolderPath)
      : undefined;
  const moving = paths.map((path) => requireNodeAtPath(nodes, path).node);
  const names = new Set<string>();
  for (const node of moving) {
    if (names.has(node.name)) {
      throw new Error(`Two of the paths are both named "${node.name}"`);
    }
    names.add(node.name);
    assertNameFree(nodes, target?._id, node.name, node._id);
  }
  await ctx.runMutation(internal.files.moveByClerkIdInternal, {
    ...scope,
    nodeIds: moving.map((node) => node._id),
    targetParentId: target?._id,
  });
  const targetPath = target === undefined ? "" : `${nodePath(nodes, target)}/`;
  return {
    moved: moving.map((node) => ({
      from: nodePath(nodes, node),
      to: `${targetPath}${node.name}`,
    })),
  };
}
