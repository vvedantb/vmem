import { memoryMatchesLexical } from "./rank";
import { isVisibleStatus } from "./scope";

export interface MemoryListFilter {
  type?: string;
  status?: string;
  source?: string;
  tags?: string[];
  searchQuery?: string;
}

export interface MemoryListable {
  type: string;
  status: string;
  source: string;
  tags: readonly string[];
  title: string;
  content: string;
}

function matchesSearchQuery(
  memory: Pick<MemoryListable, "title" | "content" | "tags">,
  searchQuery: string | undefined,
): boolean {
  return memoryMatchesLexical(memory, searchQuery);
}

function matchesAllTags(
  memoryTags: readonly string[],
  filterTags: string[] | undefined,
): boolean {
  if (filterTags === undefined || filterTags.length === 0) return true;
  const have = new Set(memoryTags);
  return filterTags.every((tag) => have.has(tag));
}

export function memoryMatchesListFilter(
  memory: MemoryListable,
  filter: MemoryListFilter,
): boolean {
  if (filter.type !== undefined && memory.type !== filter.type) return false;
  if (filter.source !== undefined && memory.source !== filter.source) {
    return false;
  }
  if (filter.status !== undefined) {
    if (memory.status !== filter.status) return false;
  } else if (!isVisibleStatus(memory.status)) {
    return false;
  }
  if (!matchesAllTags(memory.tags, filter.tags)) return false;
  return matchesSearchQuery(memory, filter.searchQuery);
}

export function pageMemoryList<T>(
  items: readonly T[],
  limit: number,
  offset: number,
): T[] {
  const start = Math.max(0, offset);
  const size = Math.max(0, limit);
  return items.slice(start, start + size);
}
