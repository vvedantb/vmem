import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";
import { memoryMatchesListFilter, type MemoryListFilter } from "./list";
import { rankMemories, type RankMemoriesOptions } from "./rank";

export { rankMemories } from "./rank";

export interface RetrieveMemoriesOptions
  extends RankMemoriesOptions, MemoryListFilter {}

export function retrieveMemoriesFromPool(
  memories: readonly MemoryWithTags[],
  query: string,
  options: RetrieveMemoriesOptions = {},
): MemoryCandidate[] {
  const filter: MemoryListFilter = {
    type: options.type,
    status: options.status,
    source: options.source,
    tags: options.tags,
  };
  const pool = memories.filter((memory) =>
    memoryMatchesListFilter(memory, filter),
  );
  return rankMemories(pool, query, options);
}

export function toMemoryCandidate(
  memory: MemoryWithTags,
  query: string,
): MemoryCandidate {
  const [ranked] = rankMemories([memory], query, { limit: 1 });
  if (ranked !== undefined) return ranked;
  return {
    ...memory,
    trace: {
      score: 0,
      scoreBreakdown: {
        fulltext: 0,
        vector: 0,
        chunk: 0,
        entity: 0,
        rrf: 0,
        recency: 0,
        temporal: 0,
        confidence: memory.confidence,
      },
      reason: "no lexical match",
    },
  };
}

// Honest non-LLM fallback: join ranked titles. Does not call OpenRouter and
// does not return 422. LLM summaries stay gated elsewhere.
export function summarizeRetrievedMemories(
  memories: Array<Pick<MemoryWithTags, "title">>,
): string {
  if (memories.length === 0) return "No relevant memories found.";
  return memories.map((memory) => memory.title).join("; ");
}
