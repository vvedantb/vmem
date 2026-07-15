import type { GraphNode } from "./types";

// client-side graph search over fields present on rendered nodes
export function graphNodeMatchesLocalSearch(
  node: GraphNode,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return false;

  if (node.title.toLowerCase().includes(q)) return true;

  for (const tag of node.tags) {
    if (tag.toLowerCase().includes(q)) return true;
  }

  const content = node.content;
  if (content !== undefined && content.toLowerCase().includes(q)) {
    return true;
  }

  const sourceType = node.sourceType;
  if (sourceType !== null && sourceType.toLowerCase().includes(q)) {
    return true;
  }

  const entityType = node.entityType;
  if (entityType !== undefined && entityType.toLowerCase().includes(q)) {
    return true;
  }

  return false;
}
