import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";
import { rankMemories } from "./rank";

export { rankMemories } from "./rank";

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
        confidence: memory.confidence,
      },
      reason: "no lexical match",
    },
  };
}

export function summarizeRetrievedMemories(
  memories: Array<Pick<MemoryWithTags, "title">>,
): string {
  if (memories.length === 0) return "No relevant memories found.";
  return memories.map((memory) => memory.title).join("; ");
}
