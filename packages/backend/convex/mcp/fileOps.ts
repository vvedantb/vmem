import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
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

export type FileListItem = {
  path: string;
  kind: "folder" | "file";
  size: number | null;
  mimeType: string | null;
  updatedAt: number;
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
    updatedAt: node.updatedAt,
  };
}

async function listFileNodes(
  ctx: ActionCtx,
  clerkId: string,
): Promise<Array<Doc<"fileNodes">>> {
  return ctx.runQuery(internal.files.listByClerkIdInternal, { clerkId });
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

export async function listFiles(
  ctx: ActionCtx,
  clerkId: string,
  path: string | undefined,
): Promise<FileListItem[]> {
  const nodes = await listFileNodes(ctx, clerkId);

  const segments = path !== undefined ? normalizePathSegments(path) : [];
  if (segments.length === 0) {
    return nodes.map((node) => toListItem(nodes, node));
  }

  const folder = resolveByPath(nodes, segments);
  if (!folder) {
    throw new Error(`Path not found: ${segments.join("/")}`);
  }
  if (folder.kind !== "folder") {
    throw new Error("Path is a file, not a folder");
  }
  return nodes
    .filter((node) => node.parentId === folder._id)
    .map((node) => toListItem(nodes, node));
}

export async function getFile(
  ctx: ActionCtx,
  clerkId: string,
  path: string,
): Promise<FileGetResult> {
  const nodes = await listFileNodes(ctx, clerkId);
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

export async function uploadFile(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    path: string;
    contentBase64?: string;
    sourceUrl?: string;
    mimeType?: string;
  },
): Promise<FileUploadResult> {
  const segments = normalizePathSegments(args.path);
  if (segments.length === 0) {
    throw new Error("Path is required");
  }
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

  const storageId = await ctx.storage.store(blob);

  try {
    await ctx.runMutation(internal.files.upsertFileByPathInternal, {
      clerkId: args.clerkId,
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
  clerkId: string,
  path: string,
): Promise<FileDeleteResult> {
  const nodes = await listFileNodes(ctx, clerkId);
  const { node } = requireNodeAtPath(nodes, path);
  const resolvedPath = nodePath(nodes, node);
  const { deletedCount } = await ctx.runMutation(
    internal.files.deleteByIdForClerkInternal,
    { clerkId, nodeId: node._id },
  );
  return { path: resolvedPath, deletedCount };
}
