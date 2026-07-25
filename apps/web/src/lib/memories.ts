import type { FunctionReturnType } from "convex/server";
import { orderBy, startCase, uniqBy } from "es-toolkit";
import type { api } from "@vmem/backend";

export type MemoryListResult = FunctionReturnType<
  typeof api.memoryApi.listMemories
>;
// single memory row from list / retrieve / getMemory api payloads
export type MemoryApiFields = MemoryListResult["memories"][number];

export type MemoryType = MemoryApiFields["type"];

export const MEMORY_TYPES: readonly MemoryType[] = [
  "profile",
  "episodic",
  "knowledge",
];

const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  profile: "Profile",
  episodic: "Episodic",
  knowledge: "Knowledge",
};

export function formatMemoryTypeLabel(type: MemoryType): string {
  return MEMORY_TYPE_LABELS[type];
}

function isMemoryType(value: string): value is MemoryType {
  return MEMORY_TYPES.some((type) => type === value);
}

// normalise api / retrieve / getMemory payloads into the client Memory shape
export function memoryFromApi(m: MemoryApiFields) {
  return {
    id: m.id,
    title: m.title,
    content: m.content,
    type: isMemoryType(m.type) ? m.type : ("knowledge" satisfies MemoryType),
    source: m.source,
    sourceUrl: m.sourceUrl ?? null,
    sourceSyncedAt: m.sourceSyncedAt ?? null,
    tags: m.tags,
    createdAt: m.createdAt,
    ...(m.profileId !== null && m.profileId !== undefined
      ? { profileId: m.profileId }
      : {}),
  };
}

export type Memory = ReturnType<typeof memoryFromApi>;

const MEMORY_SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  "browser-extension": "Extension",
  "prompt-capture": "Prompt Capture",
  youtube: "YouTube",
  google_drive: "Google Drive",
  notion: "Notion",
  mcp: "MCP",
  cursor: "Cursor",
  "client-enrichment": "Enrichment",
};

export function formatMemorySourceLabel(source: string): string {
  const mapped = MEMORY_SOURCE_LABELS[source];
  if (mapped !== undefined) {
    return mapped;
  }
  const normalized = source.replace(/[-_]+/g, " ").trim();
  if (normalized.length === 0) {
    return source;
  }
  return startCase(normalized);
}

export interface TagStats {
  tag: string;
  count: number;
  latestCreatedAt: string;
}

export function buildTagStats(memories: Memory[]): TagStats[] {
  const stats = new Map<string, { count: number; latestCreatedAt: string }>();

  for (const memory of memories) {
    for (const tag of memory.tags) {
      const existing = stats.get(tag);
      if (!existing) {
        stats.set(tag, { count: 1, latestCreatedAt: memory.createdAt });
        continue;
      }
      existing.count += 1;
      if (memory.createdAt > existing.latestCreatedAt) {
        existing.latestCreatedAt = memory.createdAt;
      }
    }
  }

  return Array.from(stats.entries())
    .map(([tag, { count, latestCreatedAt }]) => ({
      tag,
      count,
      latestCreatedAt,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

export type TagSortMode = "a-z" | "most-used" | "most-recent";

export function sortTagStats(tags: TagStats[], mode: TagSortMode): TagStats[] {
  switch (mode) {
    case "a-z":
      return orderBy(tags, ["tag"], ["asc"]);
    case "most-used":
      return orderBy(tags, ["count", "tag"], ["desc", "asc"]);
    case "most-recent":
      return orderBy(tags, ["latestCreatedAt", "tag"], ["desc", "asc"]);
  }
}

export type RelatedMemoriesResult = FunctionReturnType<
  typeof api.relationshipApi.getRelatedMemories
>;

export type RelatedMemoryEntry = RelatedMemoriesResult[number];

export function relatedMemoriesQueryKey(memoryId: string) {
  return ["relatedMemories", memoryId] as const;
}

export function uniqueRelated(
  entries: RelatedMemoriesResult,
): RelatedMemoryEntry[] {
  return uniqBy(entries, (entry) => entry.memory.id);
}

export function countUniqueRelated(entries: RelatedMemoriesResult): number {
  return uniqueRelated(entries).length;
}
