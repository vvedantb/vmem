import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";
import { rankMemories, type RetrievalLegs } from "../engine/memory/rank";
import type { MemoryLinkEdge } from "../engine/memory/links";
import { cosineSimilarity } from "./embeddings";
import type { BenchmarkCorpus, BenchmarkMemory } from "./corpus";

export const EVAL_K = 10;

export function toEvalMemory(memory: BenchmarkMemory): MemoryWithTags {
  return {
    id: memory.id,
    userId: memory.userId,
    profileId: "bench_profile",
    title: memory.title,
    content: memory.content,
    type: memory.type,
    source: memory.source,
    sourceType: memory.source,
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: memory.confidence,
    status: memory.status,
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    expiresAt: memory.expiresAt,
    tags: memory.tags,
  };
}

export function linksFromCorpus(corpus: BenchmarkCorpus): MemoryLinkEdge[] {
  return corpus.relationships.map((rel) => ({
    sourceId: rel.sourceId,
    targetId: rel.targetId,
    reason: rel.reason,
  }));
}

export function vectorScoresForQuery(
  memories: readonly MemoryWithTags[],
  queryEmbedding: readonly number[],
  memoryEmbeddings: ReadonlyMap<string, number[]>,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const memory of memories) {
    const embedding = memoryEmbeddings.get(memory.id);
    if (embedding === undefined) continue;
    scores.set(memory.id, cosineSimilarity(queryEmbedding, embedding));
  }
  return scores;
}

export function retrieveEval(
  memories: readonly MemoryWithTags[],
  query: string,
  options: {
    legs: RetrievalLegs;
    queryEmbedding: readonly number[];
    memoryEmbeddings: ReadonlyMap<string, number[]>;
    links: readonly MemoryLinkEdge[];
    limit?: number;
    nowMs?: number;
  },
): MemoryCandidate[] {
  const useVector = options.legs.vector !== false;
  return rankMemories(memories, query, {
    limit: options.limit ?? EVAL_K,
    nowMs: options.nowMs,
    legs: options.legs,
    links: options.links,
    vectorScores: useVector
      ? vectorScoresForQuery(
          memories,
          options.queryEmbedding,
          options.memoryEmbeddings,
        )
      : undefined,
  });
}
