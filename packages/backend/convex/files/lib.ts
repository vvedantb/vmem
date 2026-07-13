import type { Doc, Id } from "../_generated/dataModel";
import {
  buildChildrenByParent,
  collectSubtreeIds,
  parentKey,
} from "../lib/scopedTree";

export const FILE_STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB

export type IndexableFileKind = "pdf" | "text";

export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isTextualMime(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType.endsWith("+json") ||
    mimeType.includes("xml") ||
    mimeType.includes("markdown")
  );
}

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
    isTextualMime(mimeType)
  ) {
    return "text";
  }
  return null;
}

export { collectSubtreeIds };

export function normalizePathSegments(path: string): string[] {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function findChild(
  byParent: Map<string, Array<Doc<"fileNodes">>>,
  parentId: Id<"fileNodes"> | undefined,
  name: string,
): Doc<"fileNodes"> | null {
  const children = byParent.get(parentKey(parentId)) ?? [];
  return children.find((child) => child.name === name) ?? null;
}

export function resolveByPath(
  nodes: Array<Doc<"fileNodes">>,
  segments: string[],
): Doc<"fileNodes"> | null {
  if (segments.length === 0) return null;
  const byParent = buildChildrenByParent(nodes);
  let parentId: Id<"fileNodes"> | undefined;
  let current: Doc<"fileNodes"> | null = null;
  for (const [index, segment] of segments.entries()) {
    const child = findChild(byParent, parentId, segment);
    if (child === null) return null;
    if (index < segments.length - 1 && child.kind !== "folder") return null;
    current = child;
    parentId = child._id;
  }
  return current;
}

export function nodePath(
  nodes: Array<Doc<"fileNodes">>,
  node: Doc<"fileNodes">,
): string {
  const byId = new Map(nodes.map((n) => [n._id, n]));
  const parts: string[] = [node.name];
  let cursor =
    node.parentId === undefined ? undefined : byId.get(node.parentId);
  const seen = new Set<string>([node._id]);
  while (cursor !== undefined && !seen.has(cursor._id)) {
    seen.add(cursor._id);
    parts.push(cursor.name);
    cursor =
      cursor.parentId === undefined ? undefined : byId.get(cursor.parentId);
  }
  return parts.reverse().join("/");
}

export function isAncestorOrSelf(
  nodes: Array<Doc<"fileNodes">>,
  nodeId: Id<"fileNodes">,
  candidateId: Id<"fileNodes">,
): boolean {
  if (nodeId === candidateId) return true;
  const byId = new Map(nodes.map((n) => [n._id, n]));
  let cursor = byId.get(candidateId);
  const seen = new Set<string>();
  while (cursor !== undefined && !seen.has(cursor._id)) {
    if (cursor._id === nodeId) return true;
    seen.add(cursor._id);
    cursor =
      cursor.parentId === undefined ? undefined : byId.get(cursor.parentId);
  }
  return false;
}
