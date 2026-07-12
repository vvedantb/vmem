import type { Doc, Id } from "../_generated/dataModel";
import {
  buildChildrenByParent,
  collectSubtreeIds,
  parentKey,
} from "../lib/scopedTree";

/**
 * Pure tree/path helpers shared by the web-facing file functions (`files.ts`)
 * and the MCP file tools (`mcp/files.ts`). No Convex ctx here — callers collect
 * the user's nodes once and pass the array in, keeping these testable and
 * avoiding N round-trips when walking the tree.
 */

/** Default per-user storage limit surfaced in the UI and enforced on upload. */
export const FILE_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB

/**
 * File kinds the memory-graph indexer can extract text from. Checked by
 * extension first (browsers often send an empty MIME for `.md`), then MIME.
 * `pdf` routes through pdf-parse; `text` is decoded straight from the blob.
 * Anything else (images, binaries) is stored but not indexed.
 */
export type IndexableFileKind = "pdf" | "text";

export function detectFileKind(
  filename: string,
  mimeType: string,
): IndexableFileKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".txt") ||
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType.endsWith("+json") ||
    mimeType.includes("xml") ||
    mimeType.includes("markdown")
  ) {
    return "text";
  }
  return null;
}

export { buildChildrenByParent, collectSubtreeIds };

/**
 * Split a `/`-separated path into clean segments. Tolerates leading/trailing
 * slashes, duplicate slashes, and whitespace so agents can pass "ai-images/cat.png",
 * "/ai-images/cat.png", or "ai-images//cat.png" interchangeably.
 */
export function normalizePathSegments(path: string): string[] {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/** Find a direct child of `parentId` (root when undefined) by exact name. */
export function findChild(
  byParent: Map<string, Array<Doc<"fileNodes">>>,
  parentId: Id<"fileNodes"> | undefined,
  name: string,
): Doc<"fileNodes"> | null {
  const children = byParent.get(parentKey(parentId)) ?? [];
  return children.find((child) => child.name === name) ?? null;
}

/**
 * Resolve a path to the node it points at, walking folder segments from root.
 * Returns null if any intermediate segment is missing or is not a folder.
 */
export function resolveByPath(
  nodes: Array<Doc<"fileNodes">>,
  segments: string[],
): Doc<"fileNodes"> | null {
  if (segments.length === 0) return null;
  const byParent = buildChildrenByParent(nodes);
  let parentId: Id<"fileNodes"> | undefined;
  let current: Doc<"fileNodes"> | null = null;
  for (let i = 0; i < segments.length; i++) {
    const child = findChild(byParent, parentId, segments[i]);
    if (!child) return null;
    const isLast = i === segments.length - 1;
    if (!isLast && child.kind !== "folder") return null;
    current = child;
    parentId = child._id;
  }
  return current;
}

/** Build the full `/`-separated path of a node by walking parentId upward. */
export function nodePath(
  nodes: Array<Doc<"fileNodes">>,
  node: Doc<"fileNodes">,
): string {
  const byId = new Map(nodes.map((n) => [n._id, n]));
  const parts: string[] = [node.name];
  let cursor = node.parentId ? byId.get(node.parentId) : undefined;
  const seen = new Set<string>([node._id]);
  while (cursor && !seen.has(cursor._id)) {
    seen.add(cursor._id);
    parts.push(cursor.name);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return parts.reverse().join("/");
}

/** True if `candidateAncestorId` is `nodeId` or one of its ancestors. */
export function isAncestorOrSelf(
  nodes: Array<Doc<"fileNodes">>,
  nodeId: Id<"fileNodes">,
  candidateAncestorId: Id<"fileNodes">,
): boolean {
  if (nodeId === candidateAncestorId) return true;
  const byId = new Map(nodes.map((n) => [n._id, n]));
  let cursor = byId.get(candidateAncestorId);
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor._id)) {
    if (cursor._id === nodeId) return true;
    seen.add(cursor._id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return false;
}
