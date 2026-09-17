import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";
import type { RetrievalLegs } from "../engine/memory/rank";
import type { MemoryLinkEdge } from "../engine/memory/links";
import {
  rankedFtsHits,
  selectRetrieveCandidates,
} from "../engine/memory/candidates";
import { autoLinksFromMemories } from "../engine/memory/entities";
import { retrieveMemoriesFromPool } from "../engine/memory/retrieve";
import {
  FTS_TAKE,
  type RetrieveCandidateCaps,
} from "../engine/memory/retrieveCaps";
import { cosineSimilarity } from "./embeddings";
import type {
  BenchmarkCorpus,
  BenchmarkMemory,
  RetrievalEvalFilter,
} from "./corpus";

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
    ...(memory.eventStart === undefined
      ? {}
      : { eventStart: memory.eventStart }),
    ...(memory.eventEnd === undefined ? {} : { eventEnd: memory.eventEnd }),
    ...(memory.temporalKind === undefined
      ? {}
      : { temporalKind: memory.temporalKind }),
  };
}

export function linksFromCorpus(corpus: BenchmarkCorpus): MemoryLinkEdge[] {
  return corpus.relationships.map((rel) => ({
    sourceId: rel.sourceId,
    targetId: rel.targetId,
    reason: rel.reason,
  }));
}

export function autoLinksFromCorpus(corpus: BenchmarkCorpus): MemoryLinkEdge[] {
  return autoLinksFromMemories(corpus.memories);
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

export function ftsRanksForQuery(
  memories: readonly MemoryWithTags[],
  query: string,
  take: number = FTS_TAKE,
): Map<string, number> {
  const scored = rankedFtsHits(memories, query);
  const out = new Map<string, number>();
  const limit = Math.min(take, scored.length);
  for (let i = 0; i < limit; i += 1) {
    const row = scored[i];
    if (row === undefined) continue;
    out.set(row.memory.id, 1 / (i + 1));
  }
  return out;
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
    filter?: RetrievalEvalFilter;
    ftsRanks?: ReadonlyMap<string, number>;
    caps?: RetrieveCandidateCaps;
    threshold?: number;
    rerank?: boolean;
  },
): MemoryCandidate[] {
  const useVector = options.legs.vector !== false;
  const useFulltext = options.legs.fulltext !== false;
  const allVectorScores = useVector
    ? vectorScoresForQuery(
        memories,
        options.queryEmbedding,
        options.memoryEmbeddings,
      )
    : new Map<string, number>();

  if (options.caps !== undefined) {
    const selected = selectRetrieveCandidates(memories, query, {
      caps: options.caps,
      vectorScores: allVectorScores,
      links: options.links,
      filter: options.filter,
    });
    return retrieveMemoriesFromPool(selected.pool, query, {
      limit: options.limit ?? EVAL_K,
      nowMs: options.nowMs,
      legs: options.legs,
      links: options.links,
      type: options.filter?.type,
      tags: options.filter?.tags,
      status: options.filter?.status,
      source: options.filter?.source,
      threshold: options.threshold,
      rerank: options.rerank,
      vectorScores: useVector ? selected.vectorScores : undefined,
      ftsRanks: useFulltext ? selected.ftsRanks : undefined,
    });
  }

  return retrieveMemoriesFromPool(memories, query, {
    limit: options.limit ?? EVAL_K,
    nowMs: options.nowMs,
    legs: options.legs,
    links: options.links,
    type: options.filter?.type,
    tags: options.filter?.tags,
    status: options.filter?.status,
    source: options.filter?.source,
    threshold: options.threshold,
    rerank: options.rerank,
    vectorScores: useVector ? allVectorScores : undefined,
    ftsRanks:
      useFulltext && query.trim().length > 0
        ? (options.ftsRanks ?? ftsRanksForQuery(memories, query))
        : undefined,
  });
}
