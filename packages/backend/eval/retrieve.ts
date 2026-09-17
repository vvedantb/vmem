import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";
import type { RetrievalLegs } from "../engine/memory/rank";
import type { MemoryLinkEdge } from "../engine/memory/links";
import { retrieveMemoriesFromPool } from "../engine/memory/retrieve";
import { expandQueryTerms } from "../engine/memory/synonyms";
import { contentTokens } from "../engine/memory/tokens";
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

const FTS_TAKE = 32;

export function ftsRanksForQuery(
  memories: readonly MemoryWithTags[],
  query: string,
): Map<string, number> {
  const terms = expandQueryTerms(query);
  if (terms.length === 0) return new Map();
  const scored: Array<{ id: string; hits: number }> = [];
  for (const memory of memories) {
    const doc = new Set(
      contentTokens(
        `${memory.title} ${memory.content} ${memory.tags.join(" ")}`,
        false,
      ),
    );
    let hits = 0;
    for (const term of terms) {
      if (doc.has(term)) hits += 1;
    }
    if (hits > 0) scored.push({ id: memory.id, hits });
  }
  scored.sort((a, b) => b.hits - a.hits);
  const out = new Map<string, number>();
  const take = Math.min(FTS_TAKE, scored.length);
  for (let i = 0; i < take; i += 1) {
    const row = scored[i];
    if (row === undefined) continue;
    out.set(row.id, 1 / (i + 1));
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
  },
): MemoryCandidate[] {
  const useVector = options.legs.vector !== false;
  const useFulltext = options.legs.fulltext !== false;
  return retrieveMemoriesFromPool(memories, query, {
    limit: options.limit ?? EVAL_K,
    nowMs: options.nowMs,
    legs: options.legs,
    links: options.links,
    type: options.filter?.type,
    tags: options.filter?.tags,
    status: options.filter?.status,
    source: options.filter?.source,
    vectorScores: useVector
      ? vectorScoresForQuery(
          memories,
          options.queryEmbedding,
          options.memoryEmbeddings,
        )
      : undefined,
    ftsRanks:
      useFulltext && query.trim().length > 0
        ? (options.ftsRanks ?? ftsRanksForQuery(memories, query))
        : undefined,
  });
}
