/** Sentinel key for nodes with no parent (scope root). */
export const ROOT_PARENT_KEY = "__root__";

export function parentKey(parentId?: string): string {
  return parentId ?? ROOT_PARENT_KEY;
}

export function buildChildrenByParent<
  T extends { parentId?: string; _id: string },
>(nodes: T[]): Map<string, T[]> {
  const byParent = new Map<string, T[]>();
  for (const node of nodes) {
    const key = parentKey(node.parentId);
    const list = byParent.get(key) ?? [];
    list.push(node);
    byParent.set(key, list);
  }
  return byParent;
}

export function collectSubtreeIds<T extends { _id: string; parentId?: string }>(
  nodes: T[],
  rootId: T["_id"],
): T["_id"][] {
  const byParent = buildChildrenByParent(nodes);
  const ids: T["_id"][] = [];
  const stack: T["_id"][] = [rootId];
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
