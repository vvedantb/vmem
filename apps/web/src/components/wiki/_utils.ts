import type { Doc, Id } from "@vmem/backend";
import type { JSONContent } from "@tiptap/react";

/** One node of a rendered wiki tree (folders contain children). */
export interface WikiTreeNode {
  node: Doc<"wikiNodes">;
  children: WikiTreeNode[];
}

/**
 * Droppable id for the sidebar's root container — dropping a node here moves it
 * to the top level (`parentId === undefined`). Distinct from any real node id.
 */
export const WIKI_ROOT_DROP_ID = "__wiki_root__";

/** Minimal node shape `resolveWikiMove` needs; `Doc<"wikiNodes">` satisfies it. */
interface MovableNode<TId extends string> {
  _id: TId;
  parentId?: TId;
  kind: "folder" | "document";
  order: number;
}

/**
 * Work out the `moveNode` arguments for a drag-and-drop drop, or `null` when the
 * drop is a no-op or invalid (so the caller can skip the mutation entirely).
 *
 * `overId` is either `WIKI_ROOT_DROP_ID` (move to top level) or the id of a
 * folder node (move inside it). The new order appends the node to the end of its
 * destination siblings — the sidebar does not support precise reordering.
 *
 * Returns `null` when the drop targets the node itself, its current parent (no
 * change), a non-folder, or one of its own descendants (which would create a
 * cycle — mirrors the backend guard so we never fire a doomed mutation).
 *
 * Generic over the id type so production infers `Id<"wikiNodes">` from
 * `Doc<"wikiNodes">` while tests can pass plain-string ids.
 */
export function resolveWikiMove<TId extends string>(
  nodes: Array<MovableNode<TId>>,
  activeId: string,
  overId: string | undefined,
): { id: TId; newParentId: TId | undefined; newOrder: number } | null {
  if (overId === undefined || activeId === overId) return null;

  const active = nodes.find((n) => n._id === activeId);
  if (!active) return null;

  let newParentId: TId | undefined;
  if (overId === WIKI_ROOT_DROP_ID) {
    newParentId = undefined;
  } else {
    const target = nodes.find((n) => n._id === overId);
    if (!target || target.kind !== "folder") return null;
    newParentId = target._id;
  }

  // No-op: the node already lives directly under this parent.
  if ((active.parentId ?? undefined) === newParentId) return null;

  // Block dropping a node into its own subtree (would create a cycle).
  if (newParentId !== undefined) {
    const subtree = collectSubtreeIds(nodes, [activeId]);
    if (subtree.has(newParentId)) return null;
  }

  // Append to the end of the destination's existing siblings.
  const siblings = nodes.filter(
    (n) => (n.parentId ?? undefined) === newParentId && n._id !== activeId,
  );
  const newOrder =
    siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.order)) + 1;

  return { id: active._id, newParentId, newOrder };
}

/** Folders first, then documents; each group sorted A–Z by title. */
export function compareWikiTreeSiblings(
  a: Pick<Doc<"wikiNodes">, "kind" | "title">,
  b: Pick<Doc<"wikiNodes">, "kind" | "title">,
): number {
  const aRank = a.kind === "folder" ? 0 : 1;
  const bRank = b.kind === "folder" ? 0 : 1;
  if (aRank !== bRank) return aRank - bRank;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

/**
 * Build a hierarchical tree of WikiTreeNodes from the flat listTree result.
 * Roots have `parentId === undefined`. Siblings are folders first, then
 * documents, each group sorted A–Z by title (display order only; `order` is
 * still used for drag-and-drop mutations).
 */
export function buildTree(nodes: Array<Doc<"wikiNodes">>): WikiTreeNode[] {
  const childrenByParent = new Map<string, Array<Doc<"wikiNodes">>>();
  const ROOT_KEY = "__root__";

  for (const node of nodes) {
    const key = node.parentId ?? ROOT_KEY;
    const list = childrenByParent.get(key) ?? [];
    list.push(node);
    childrenByParent.set(key, list);
  }

  function build(parentKey: string): WikiTreeNode[] {
    const siblings = childrenByParent.get(parentKey) ?? [];
    return siblings
      .slice()
      .sort(compareWikiTreeSiblings)
      .map((node) => ({
        node,
        children: build(node._id),
      }));
  }

  return build(ROOT_KEY);
}

/**
 * Expand a set of root ids to include every descendant, given the flat node
 * list. Used so bulk delete (and its optimistic update) can drop whole subtrees
 * and tell whether the open document is among the casualties.
 */
export function collectSubtreeIds(
  nodes: Array<{ _id: string; parentId?: string }>,
  rootIds: Iterable<string>,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    const key = node.parentId ?? "__root__";
    const list = childrenByParent.get(key) ?? [];
    list.push(node._id);
    childrenByParent.set(key, list);
  }

  const result = new Set<string>();
  const stack: string[] = [...rootIds];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || result.has(current)) continue;
    result.add(current);
    for (const child of childrenByParent.get(current) ?? []) {
      stack.push(child);
    }
  }
  return result;
}

/** First document in tree display order (depth-first), or null if none exist. */
export function findFirstDocumentId(
  tree: WikiTreeNode[],
): Id<"wikiNodes"> | null {
  for (const item of tree) {
    if (item.node.kind === "document") {
      return item.node._id;
    }
    const childId = findFirstDocumentId(item.children);
    if (childId !== null) {
      return childId;
    }
  }
  return null;
}

/**
 * Walk up `parentId` chain for the given node, returning ancestors from root → parent.
 * Excludes the node itself. Used for breadcrumb rendering.
 */
export function findAncestors(
  node: Doc<"wikiNodes">,
  allNodes: Array<Doc<"wikiNodes">>,
): Array<Doc<"wikiNodes">> {
  const byId = new Map<string, Doc<"wikiNodes">>();
  for (const n of allNodes) byId.set(n._id, n);

  const chain: Array<Doc<"wikiNodes">> = [];
  let currentParentId: Id<"wikiNodes"> | undefined = node.parentId;
  while (currentParentId !== undefined) {
    const parent = byId.get(currentParentId);
    if (!parent) break;
    chain.unshift(parent);
    currentParentId = parent.parentId;
  }
  return chain;
}

/** One heading entry extracted from a TipTap JSON document for the outline pane. */
export interface OutlineHeading {
  /** Stable identifier within the document — position index + text */
  id: string;
  level: number;
  text: string;
  /** ProseMirror document position where the heading node starts. */
  pos: number;
}

/**
 * Walk a TipTap JSON document collecting heading nodes with their text content
 * and ProseMirror positions (for click-to-scroll in the outline pane).
 *
 * Positions are calculated by mirroring ProseMirror's node-size semantics:
 * each node contributes `nodeSize = content size + 2` for non-leaf block nodes,
 * and `text.length` for text nodes.
 */
export function extractHeadings(doc: JSONContent): OutlineHeading[] {
  const headings: OutlineHeading[] = [];

  function nodeText(node: JSONContent): string {
    if (node.type === "text") return node.text ?? "";
    if (!node.content) return "";
    return node.content.map(nodeText).join("");
  }

  function nodeSize(node: JSONContent): number {
    if (node.type === "text") return (node.text ?? "").length;
    const contentSize = (node.content ?? []).reduce(
      (sum, child) => sum + nodeSize(child),
      0,
    );
    // Block/inline nodes contribute 2 extra (open + close tokens).
    return contentSize + 2;
  }

  // Walk top-level doc.content — ProseMirror's doc root itself starts at pos 0
  // with an opening token of size 1.
  let cursor = 0;
  const topLevel = doc.content ?? [];
  for (const child of topLevel) {
    const startPos = cursor + 1; // +1 accounts for the doc's opening token
    if (child.type === "heading") {
      const level =
        typeof child.attrs?.level === "number" ? child.attrs.level : 1;
      const text = nodeText(child);
      if (text.length > 0) {
        headings.push({
          id: `${startPos}-${text}`,
          level,
          text,
          pos: startPos,
        });
      }
    }
    cursor += nodeSize(child);
  }
  return headings;
}

/**
 * Flatten a TipTap JSON doc into plain text (for the Convex search index).
 * Preserves paragraph breaks as single newlines.
 */
export function docToPlainText(doc: JSONContent): string {
  function walk(node: JSONContent): string {
    if (node.type === "text") return node.text ?? "";
    const children = (node.content ?? []).map(walk).join("");
    if (node.type === "paragraph" || node.type === "heading") {
      return children + "\n";
    }
    return children;
  }
  return walk(doc).trim();
}

/** Count words in plain text (whitespace-separated tokens). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

export function formatWikiDocForClipboard(
  title: string,
  markdown: string,
): string {
  const trimmedTitle = title.trim();
  const trimmedMarkdown = markdown.trim();

  if (trimmedMarkdown.length === 0) {
    return trimmedTitle.length > 0 ? `# ${trimmedTitle}` : "";
  }

  const firstLine = trimmedMarkdown.split("\n")[0] ?? "";
  if (trimmedTitle.length > 0 && firstLine === `# ${trimmedTitle}`) {
    return trimmedMarkdown;
  }

  if (trimmedTitle.length === 0) {
    return trimmedMarkdown;
  }

  return `# ${trimmedTitle}\n\n${trimmedMarkdown}`;
}
