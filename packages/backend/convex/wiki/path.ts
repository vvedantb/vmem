import type { Doc, Id } from "../_generated/dataModel";

const ROOT_KEY = "__root__";

/** Minimal wiki tree shape for path resolution (no Convex coupling in tests). */
export interface WikiPathNode {
  id: Id<"wikiNodes">;
  parentId: Id<"wikiNodes"> | null;
  title: string;
  kind: "folder" | "document";
}

export function wikiPathNodeFromDoc(node: Doc<"wikiNodes">): WikiPathNode {
  return {
    id: node._id,
    parentId: node.parentId ?? null,
    title: node.title,
    kind: node.kind,
  };
}

function parentKey(parentId: Id<"wikiNodes"> | null): string {
  return parentId ?? ROOT_KEY;
}

/** Split a slash path into folder title segments (trimmed, no empties). */
export function normalizeWikiPathSegments(path: string): string[] {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function buildWikiChildrenByParent(
  nodes: WikiPathNode[],
): Map<string, WikiPathNode[]> {
  const byParent = new Map<string, WikiPathNode[]>();
  for (const node of nodes) {
    const key = parentKey(node.parentId);
    const bucket = byParent.get(key);
    if (bucket) {
      bucket.push(node);
    } else {
      byParent.set(key, [node]);
    }
  }
  return byParent;
}

/** Direct child of `parentId` (root when null) with an exact title match. */
export function findWikiChild(
  byParent: Map<string, WikiPathNode[]>,
  parentId: Id<"wikiNodes"> | null,
  title: string,
): WikiPathNode | null {
  const children = byParent.get(parentKey(parentId)) ?? [];
  return children.find((child) => child.title === title) ?? null;
}

/**
 * Resolve a slash path to the folder id at the end of the path.
 * Returns null if any segment is missing or is not a folder.
 */
export function resolveWikiFolderPath(
  nodes: WikiPathNode[],
  path: string,
): Id<"wikiNodes"> | null {
  const segments = normalizeWikiPathSegments(path);
  if (segments.length === 0) return null;

  const byParent = buildWikiChildrenByParent(nodes);
  let currentParent: Id<"wikiNodes"> | null = null;

  for (const title of segments) {
    const child = findWikiChild(byParent, currentParent, title);
    if (!child || child.kind !== "folder") return null;
    currentParent = child.id;
  }

  return currentParent;
}

export function wikiPathNodesFromDocs(
  nodes: Doc<"wikiNodes">[],
): WikiPathNode[] {
  return nodes.map(wikiPathNodeFromDoc);
}
