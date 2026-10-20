import { memoryMatchesLexical } from "./rank";
import { isVisibleStatus } from "./scope";
import { sanitizeTag } from "./tags";

export interface MemoryListFilter {
  type?: string;
  // any of these types (OR), on top of `type`
  types?: readonly string[];
  status?: string;
  source?: string;
  // any of these sources (OR), on top of `source`
  sources?: readonly string[];
  tags?: string[];
  searchQuery?: string;
  // inclusive createdAt bounds, epoch ms
  createdAfter?: number;
  createdBefore?: number;
}

export interface MemoryListable {
  type: string;
  status: string;
  source: string;
  tags: readonly string[];
  title: string;
  content: string;
  // docs carry epoch ms, API rows carry an ISO string
  createdAt?: number | string;
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

function matchesAnyOf(
  value: string,
  wanted: readonly string[] | undefined,
): boolean {
  if (wanted === undefined) return true;
  const values = wanted
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return values.length === 0 || values.includes(value);
}

function createdAtMs(createdAt: number | string | undefined): number | null {
  if (createdAt === undefined) return null;
  const ms = typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Number.isFinite(ms) ? ms : null;
}

function matchesCreatedWindow(
  memory: Pick<MemoryListable, "createdAt">,
  filter: Pick<MemoryListFilter, "createdAfter" | "createdBefore">,
): boolean {
  if (filter.createdAfter === undefined && filter.createdBefore === undefined) {
    return true;
  }
  const ms = createdAtMs(memory.createdAt);
  if (ms === null) return false;
  if (filter.createdAfter !== undefined && ms < filter.createdAfter) {
    return false;
  }
  return filter.createdBefore === undefined || ms <= filter.createdBefore;
}

export function memoryMatchesListFilter(
  memory: MemoryListable,
  filter: MemoryListFilter,
): boolean {
  const type = normalizedOrUndefined(filter.type);
  if (type !== undefined && memory.type !== type) return false;
  if (!matchesAnyOf(memory.type, filter.types)) return false;
  const source = normalizedOrUndefined(filter.source);
  if (source !== undefined && memory.source !== source) {
    return false;
  }
  if (!matchesAnyOf(memory.source, filter.sources)) return false;
  if (!matchesCreatedWindow(memory, filter)) return false;
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
