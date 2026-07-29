import { type WikiNodeKind, wikiKindHasContent } from "@vmem/shared";
import type { WikiListNode, WikiNodeId } from "./-types";
import type { JSONContent } from "@tiptap/react";

// one node of a rendered wiki tree (folders contain children)
export interface WikiTreeNode {
  node: WikiListNode;
  children: WikiTreeNode[];
}

// sidebar root droppable move to top level (parentId undefined)
export const WIKI_ROOT_DROP_ID = "__wiki_root__";

// minimal shape resolveWikiMove needs
interface MovableNode<TId extends string> {
  _id: TId;
  parentId?: TId;
  kind: WikiNodeKind;
  order: number;
}

// moveNode args for a wiki drop, or null if invalid/no-op
// AI-generated (Claude), prompt: "resolve wiki drag drop parent order without cycles"
// Modified by me: root drop id and append after sibling max order
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

  // no-op if already under this parent
  if ((active.parentId ?? undefined) === newParentId) return null;

  // block drop into own subtree (cycle)
  if (newParentId !== undefined) {
    const subtree = collectSubtreeIds(nodes, [activeId]);
    if (subtree.has(newParentId)) return null;
  }

  // append after existing siblings
  const siblings = nodes.filter(
    (n) => (n.parentId ?? undefined) === newParentId && n._id !== activeId,
  );
  const newOrder =
    siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.order)) + 1;

  return { id: active._id, newParentId, newOrder };
}

// folders first, then docs each group a z by title
export function compareWikiTreeSiblings(
  a: Pick<WikiListNode, "kind" | "title">,
  b: Pick<WikiListNode, "kind" | "title">,
): number {
  const aRank = a.kind === "folder" ? 0 : 1;
  const bRank = b.kind === "folder" ? 0 : 1;
  if (aRank !== bRank) return aRank - bRank;
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

// flat listTree → tree display sort only (order still used for dnd)
export function buildTree(nodes: Array<WikiListNode>): WikiTreeNode[] {
  const childrenByParent = new Map<string, Array<WikiListNode>>();
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

// expand root ids to full subtrees (bulk delete / optimistic drop)
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

// first document or artifact in display order (depth first), or null
export function findFirstDocumentId(tree: WikiTreeNode[]): WikiNodeId | null {
  for (const item of tree) {
    if (wikiKindHasContent(item.node.kind)) {
      return item.node._id;
    }
    const childId = findFirstDocumentId(item.children);
    if (childId !== null) {
      return childId;
    }
  }
  return null;
}

// ancestors root → parent for breadcrumbs (excludes self)
export function findAncestors(
  node: WikiListNode,
  allNodes: Array<WikiListNode>,
): Array<WikiListNode> {
  const byId = new Map<string, WikiListNode>();
  for (const n of allNodes) byId.set(n._id, n);

  const chain: Array<WikiListNode> = [];
  let currentParentId: WikiNodeId | undefined = node.parentId;
  while (currentParentId !== undefined) {
    const parent = byId.get(currentParentId);
    if (!parent) break;
    chain.unshift(parent);
    currentParentId = parent.parentId;
  }
  return chain;
}

// heading from TipTap toc for outline pane
export interface OutlineHeading {
  id: string;
  level: number;
  text: string;
  // ProseMirror start position
  pos: number;
}

// tiptap json → plain text for convex search (paragraph breaks = \n)
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

// whitespace separated word count
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
