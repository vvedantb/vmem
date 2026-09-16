import { memoryMatchesLexical } from "./rank";
import { isVisibleStatus } from "./scope";
import { sanitizeTag } from "./tags";

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
  const wanted = filterTags.map(sanitizeTag).filter((tag) => tag.length > 0);
  if (wanted.length === 0) return true;
  const have = new Set(
    memoryTags.map((tag) => sanitizeTag(tag)).filter((tag) => tag.length > 0),
  );
  return wanted.every((tag) => have.has(tag));
}

function normalizedOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

export function memoryMatchesListFilter(
  memory: MemoryListable,
  filter: MemoryListFilter,
): boolean {
  const type = normalizedOrUndefined(filter.type);
  if (type !== undefined && memory.type !== type) return false;
  const source = normalizedOrUndefined(filter.source);
  if (source !== undefined && memory.source !== source) {
    return false;
  }
  const status = normalizedOrUndefined(filter.status);
  if (status !== undefined) {
    if (memory.status !== status) return false;
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
