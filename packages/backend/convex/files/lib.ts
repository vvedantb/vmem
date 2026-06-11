import type { Doc, Id } from "../_generated/dataModel";

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

const ROOT_KEY = "__root__";

/** Map a node's parentId to the children-bucket key (root nodes share one key). */
function parentKey(parentId: Id<"fileNodes"> | undefined): string {
  return parentId ?? ROOT_KEY;
}

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

/** Group nodes by parent for O(1) child lookups during tree walks. */
export function buildChildrenByParent(
  nodes: Array<Doc<"fileNodes">>,
): Map<string, Array<Doc<"fileNodes">>> {
  const byParent = new Map<string, Array<Doc<"fileNodes">>>();
  for (const node of nodes) {
    const key = parentKey(node.parentId);
    const list = byParent.get(key) ?? [];
    list.push(node);
    byParent.set(key, list);
  }
  return byParent;
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

/** Collect a node and all of its descendants (ids), depth-first. */
export function collectSubtreeIds(
  nodes: Array<Doc<"fileNodes">>,
  rootId: Id<"fileNodes">,
): Array<Id<"fileNodes">> {
  const byParent = buildChildrenByParent(nodes);
  const ids: Array<Id<"fileNodes">> = [];
  const stack: Array<Id<"fileNodes">> = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    ids.push(current);
    for (const child of byParent.get(current) ?? []) {
      stack.push(child._id);
    }
  }
  return ids;
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
