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

// pre-#148 / post-cutover retrieve: list + substring, vector/RRF stubbed at 0
export function substringRetrieve(
  memories: readonly MemoryWithTags[],
  query: string,
  limit: number,
): MemoryCandidate[] {
  const needle = query.trim().toLowerCase();
  const hits: MemoryCandidate[] = [];
  for (const memory of memories) {
    const hay = `${memory.title}\n${memory.content}`.toLowerCase();
    const fulltext = needle.length === 0 || hay.includes(needle) ? 1 : 0;
    if (fulltext === 0) continue;
    hits.push({
      ...memory,
      trace: {
        score: fulltext,
        scoreBreakdown: emptyScoreBreakdown(fulltext, memory.confidence),
        reason:
          needle.length === 0
            ? "recent memories"
            : "title or content substring match",
      },
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
