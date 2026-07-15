import type { MemoryType } from "./memories";
import type { ListItemKind } from "./list-items";

export interface MemoryViewFilterParams {
  kinds: readonly ListItemKind[];
  tags: readonly string[];
  sources: readonly string[];
  types: readonly MemoryType[];
}

export const CLEARED_MEMORY_VIEW_FILTERS: {
  kinds: ListItemKind[];
  tags: string[];
  sources: string[];
  types: MemoryType[];
} = {
  kinds: [],
  tags: [],
  sources: [],
  types: [],
};

export function kindPassesFilter(
  kind: ListItemKind,
  selectedKinds: readonly ListItemKind[],
): boolean {
  return selectedKinds.length === 0 || selectedKinds.includes(kind);
}

export function tagsPassFilter(
  nodeTags: readonly string[],
  selectedTags: readonly string[],
  kind: ListItemKind,
): boolean {
  return (
    selectedTags.length === 0 ||
    kind !== "memory" ||
    selectedTags.every((tag) =>
      nodeTags.some((nodeTag) => nodeTag.toLowerCase() === tag.toLowerCase()),
    )
  );
}

export function sourcePassesFilter(
  source: string | undefined,
  selectedSources: readonly string[],
  kind: ListItemKind,
): boolean {
  return (
    selectedSources.length === 0 ||
    kind !== "memory" ||
    (source !== undefined && selectedSources.includes(source))
  );
}

export function typePassesFilter(
  type: MemoryType | undefined,
  selectedTypes: readonly MemoryType[],
  kind: ListItemKind,
): boolean {
  return (
    selectedTypes.length === 0 ||
    kind !== "memory" ||
    (type !== undefined && selectedTypes.includes(type))
  );
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

export function countActiveMemoryViewFilters(
  params: MemoryViewFilterParams,
): number {
  let count = 0;
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
