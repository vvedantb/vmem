import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";

function emptyScoreBreakdown(fulltext: number, confidence: number) {
  return {
    fulltext,
    vector: 0,
    chunk: 0,
    entity: 0,
    rrf: fulltext,
    recency: 0,
    confidence,
  };
}

export function toMemoryCandidate(
  memory: MemoryWithTags,
  query: string,
): MemoryCandidate {
  const needle = query.trim().toLowerCase();
  const hay = `${memory.title}\n${memory.content}`.toLowerCase();
  const fulltext = needle.length === 0 || hay.includes(needle) ? 1 : 0;
  return {
    ...memory,
    trace: {
      score: fulltext,
      scoreBreakdown: emptyScoreBreakdown(fulltext, memory.confidence),
      reason:
        needle.length === 0
          ? "recent memories"
          : fulltext === 1
            ? "title or content substring match"
            : "listed without substring match",
    },
  };
}

export function summarizeRetrievedMemories(
  memories: Array<Pick<MemoryWithTags, "title">>,
): string {
  if (memories.length === 0) return "No relevant memories found.";
  return memories.map((memory) => memory.title).join("; ");
}
