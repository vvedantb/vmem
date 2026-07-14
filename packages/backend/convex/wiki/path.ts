import type { Doc, Id } from "../_generated/dataModel";
import { parentKey } from "../lib/scopedTree";

// minimal wiki tree shape for path resolution (no Convex coupling in tests)
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

function wikiParentKey(parentId: Id<"wikiNodes"> | null): string {
  return parentKey(parentId ?? undefined);
}

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
    const key = wikiParentKey(node.parentId);
    const bucket = byParent.get(key);
    if (bucket) {
      bucket.push(node);
    } else {
      byParent.set(key, [node]);
    }
  }
  return byParent;
}

export function findWikiChild(
  byParent: Map<string, WikiPathNode[]>,
  parentId: Id<"wikiNodes"> | null,
  title: string,
): WikiPathNode | null {
  const children = byParent.get(wikiParentKey(parentId)) ?? [];
  return children.find((child) => child.title === title) ?? null;
}

// resolve a slash path to the folder id at the end, or null if missing/not a folder
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
