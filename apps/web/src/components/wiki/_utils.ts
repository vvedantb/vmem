import type { Doc, Id } from "@vmem/backend";
import type { JSONContent } from "@tiptap/react";

/** One node of a rendered wiki tree (folders contain children). */
export interface WikiTreeNode {
  node: Doc<"wikiNodes">;
  children: WikiTreeNode[];
}

/**
 * Build a hierarchical tree of WikiTreeNodes from the flat listTree result.
 * Roots have `parentId === undefined`. Children are sorted by order ascending
 * (the backend already sorts, but we re-sort defensively after grouping).
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
      .sort((a, b) => a.order - b.order)
      .map((node) => ({
        node,
        children: build(node._id),
      }));
  }

  return build(ROOT_KEY);
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
