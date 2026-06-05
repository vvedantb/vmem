import type { MemoryType } from "@/lib/memories";
import { LIST_ITEM_KINDS, type ListItemKind } from "@/lib/list-items";

/** URL-backed filter fields shared by /memories/list and /memories/graph. */
export interface MemoryViewFilterParams {
  profile: string | null;
  kinds: readonly ListItemKind[];
  tags: readonly string[];
  sources: readonly string[];
  types: readonly MemoryType[];
}

export const CLEARED_MEMORY_VIEW_FILTERS = {
  profile: null,
  kinds: [] as ListItemKind[],
  tags: [] as string[],
  sources: [] as string[],
  types: [] as MemoryType[],
};

/** Empty `kinds` in the URL means every kind is visible. */
export function resolveActiveKindSet(
  kinds: readonly ListItemKind[],
): ReadonlySet<ListItemKind> {
  if (kinds.length === 0) {
    return new Set(LIST_ITEM_KINDS);
  }
  return new Set(kinds);
}

export function kindPassesFilter(
  kind: ListItemKind,
  selectedKinds: readonly ListItemKind[],
): boolean {
  if (selectedKinds.length === 0) {
    return true;
  }
  return selectedKinds.includes(kind);
}

/** Memory nodes must include every selected tag; other kinds pass through. */
export function tagsPassFilter(
  nodeTags: readonly string[],
  selectedTags: readonly string[],
  kind: ListItemKind,
): boolean {
  if (selectedTags.length === 0) {
    return true;
  }
  if (kind !== "memory") {
    return true;
  }
  return selectedTags.every((tag) =>
    nodeTags.some((nodeTag) => nodeTag.toLowerCase() === tag.toLowerCase()),
  );
}

export function sourcePassesFilter(
  source: string | undefined,
  selectedSources: readonly string[],
  kind: ListItemKind,
): boolean {
  if (selectedSources.length === 0) {
    return true;
  }
  if (kind !== "memory") {
    return true;
  }
  return source !== undefined && selectedSources.includes(source);
}

export function typePassesFilter(
  type: MemoryType | undefined,
  selectedTypes: readonly MemoryType[],
  kind: ListItemKind,
): boolean {
  if (selectedTypes.length === 0) {
    return true;
  }
  if (kind !== "memory") {
    return true;
  }
  return type !== undefined && selectedTypes.includes(type);
}

export function apiGraphNodePassesFilters(
  node: {
    kind: ListItemKind;
    tags: readonly string[];
    source?: string;
    type?: MemoryType;
  },
  filters: Pick<MemoryViewFilterParams, "kinds" | "tags" | "sources" | "types">,
): boolean {
  return (
    kindPassesFilter(node.kind, filters.kinds) &&
    tagsPassFilter(node.tags, filters.tags, node.kind) &&
    sourcePassesFilter(node.source, filters.sources, node.kind) &&
    typePassesFilter(node.type, filters.types, node.kind)
  );
}

/** Per header-controls rules: each non-default filter field counts as 1. */
export function countActiveMemoryViewFilters(
  params: MemoryViewFilterParams,
): number {
  let count = 0;
  if (params.profile !== null) count += 1;
  if (params.kinds.length > 0) count += 1;
  if (params.tags.length > 0) count += 1;
  if (params.sources.length > 0) count += 1;
  if (params.types.length > 0) count += 1;
  return count;
}

export function hasActiveMemoryViewFilters(
  params: MemoryViewFilterParams,
): boolean {
  return countActiveMemoryViewFilters(params) > 0;
}
