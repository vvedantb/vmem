import { v } from "convex/values";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import {
  normalizePathSegments,
  nodePath,
  resolveByPath,
  isImageMime,
  isTextualMime,
} from "../files/lib";

/**
 * MCP file tools backend — the agent-facing surface of the shared filesystem.
 *
 * Files are addressed by `/`-separated paths (e.g. "ai-images/cat.png") rather
 * than ids, so agents can read/write without a list→id round-trip. All nodes
 * are user-scoped by clerkId (MCP scope is ignored — files are user-wide, like
 * wiki). Bytes live in Convex storage; uploads accept inline base64 or a
 * sourceUrl the server fetches.
 */

// Inline-content caps. MCP tool args/results are JSON, so bytes ride as base64.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB (Convex 16 MiB action-arg limit w/ base64 overhead)
const MAX_INLINE_IMAGE_BYTES = 4 * 1024 * 1024; // return image bytes inline up to 4 MB
const MAX_INLINE_TEXT_BYTES = 100 * 1024; // return text inline up to 100 KB

interface FileListItem {
  path: string;
  kind: "folder" | "file";
  size: number | null;
  mimeType: string | null;
  updatedAt: number;
}

interface FileGetResult {
  path: string;
  kind: "file";
  mimeType: string;
  size: number;
  downloadUrl: string | null;
  /** Present for images ≤ 4 MB — lets the agent render the image directly. */
  contentBase64?: string;
  /** Present for text-like files ≤ 100 KB. */
  text?: string;
}

interface FileUploadResult {
  path: string;
  kind: "file";
  mimeType: string;
  size: number;
}

interface FileDeleteResult {
  path: string;
  deletedCount: number;
}

/** Decode base64 (tolerating a `data:` URL prefix) into a backing ArrayBuffer. */
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
  const binary = atob(payload);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return { buffer, dataUrlMime };
}

/** Encode raw bytes to base64 in chunks (avoids call-stack limits). */
function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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

export const mcpListFiles = internalAction({
  args: { clerkId: v.string(), path: v.optional(v.string()) },
  handler: async (ctx, args): Promise<FileListItem[]> => {
    const nodes = await listFileNodes(ctx, args.clerkId);

    const segments =
      args.path !== undefined ? normalizePathSegments(args.path) : [];
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
  },
});

export const mcpGetFile = internalAction({
  args: { clerkId: v.string(), path: v.string() },
  handler: async (ctx, args): Promise<FileGetResult> => {
    const nodes = await listFileNodes(ctx, args.clerkId);
    const { node } = requireNodeAtPath(nodes, args.path);
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
          result.contentBase64 = encodeBase64(new Uint8Array(buffer));
        }
      } else if (isTextualMime(mimeType) && size <= MAX_INLINE_TEXT_BYTES) {
        const blob = await ctx.storage.get(node.storageId);
        if (blob) {
          result.text = await blob.text();
        }
      }
    }

    return result;
  },
});

export const mcpUploadFile = internalAction({
  args: {
    clerkId: v.string(),
    path: v.string(),
    contentBase64: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    mimeType: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<FileUploadResult> => {
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
      // Roll back the orphaned blob if recording the node failed.
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
  },
});

export const mcpDeleteFile = internalAction({
  args: { clerkId: v.string(), path: v.string() },
  handler: async (ctx, args): Promise<FileDeleteResult> => {
    const nodes = await listFileNodes(ctx, args.clerkId);
    const { node } = requireNodeAtPath(nodes, args.path);
    const path = nodePath(nodes, node);
    const { deletedCount } = await ctx.runMutation(
      internal.files.deleteByIdForClerkInternal,
      { clerkId: args.clerkId, nodeId: node._id },
    );
    return { path, deletedCount };
  },
});
