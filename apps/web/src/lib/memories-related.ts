import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

export type RelatedMemoriesResult = FunctionReturnType<
  typeof api.relationshipApi.getRelatedMemories
>;

export type RelatedMemoryEntry = RelatedMemoriesResult[number];

export function uniqueRelated(
  entries: RelatedMemoriesResult,
): RelatedMemoryEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.memory.id)) return false;
    seen.add(entry.memory.id);
    return true;
  });
}

export function countUniqueRelated(entries: RelatedMemoriesResult): number {
  return uniqueRelated(entries).length;
}
