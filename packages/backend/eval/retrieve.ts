import type { MemoryCandidate, MemoryWithTags } from "@vmem/sdk";
import type { RetrievalLegs } from "../engine/memory/rank";
import type { MemoryLinkEdge } from "../engine/memory/links";
import {
  rankedFtsHits,
  selectRetrieveCandidates,
} from "../engine/memory/candidates";
import { autoLinksFromMemories } from "../engine/memory/entities";
import {
  readSystemOneApiKey,
  type EvaluateSystemOneArgs,
  type SystemOneResponse,
} from "../engine/llm/systemOneClient";
import {
  applyJevRetrieveGate,
  jevRankPoolLimit,
} from "../engine/memory/jevGate";
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

export const EVAL_JEV_KEY_REQUIRED =
  "EVAL_JEV requires TYPESAFE_API_KEY (or TYPESAFE_AI_API_KEY / JEV_API_KEY). Mocking System One is not valid for labelled Jev numbers.";

export function evalJevEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const raw = env.EVAL_JEV?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function evalJevConcurrency(
  env: Record<string, string | undefined> = process.env,
): number {
  const parsed = Number.parseInt(env.EVAL_JEV_CONCURRENCY ?? "4", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 4;
  return Math.min(parsed, 8);
}

export type RetrieveEvalRerank = boolean | "jev";
export type EvalJudge = "jev" | "off";

export function evalWantsJev(options: {
  judge?: EvalJudge;
  rerank?: RetrieveEvalRerank;
  jevDefaultOn?: boolean;
}): boolean {
  if (options.judge === "off") return false;
  if (options.judge === "jev" || options.rerank === "jev") return true;
  return options.jevDefaultOn === true;
}

export interface RetrieveEvalOptions {
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
  rerank?: RetrieveEvalRerank;
  judge?: EvalJudge;
  jevDefaultOn?: boolean;
  apiKey?: string;
  requireJevKey?: boolean;
  jevThreshold?: number;
  evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
}

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

function resolvedEvalApiKey(options: RetrieveEvalOptions): string | undefined {
  if (options.apiKey !== undefined) {
    const explicit = options.apiKey.trim();
    return explicit.length > 0 ? explicit : undefined;
  }
  return readSystemOneApiKey();
}

export function rankEvalRetrieve(
  memories: readonly MemoryWithTags[],
  query: string,
  options: RetrieveEvalOptions,
): MemoryCandidate[] {
  const jev = evalWantsJev(options);
  const userLimit = options.limit ?? EVAL_K;
  const rankLimit = jevRankPoolLimit(userLimit, jev);
  const useVector = options.legs.vector !== false;
  const useFulltext = options.legs.fulltext !== false;
  const allVectorScores = useVector
    ? vectorScoresForQuery(
        memories,
        options.queryEmbedding,
        options.memoryEmbeddings,
      )
    : new Map<string, number>();
  const rankOpts = {
    limit: rankLimit,
    nowMs: options.nowMs,
    legs: options.legs,
    links: options.links,
    type: options.filter?.type,
    tags: options.filter?.tags,
    status: options.filter?.status,
    source: options.filter?.source,
    threshold: options.threshold,
    rerank: options.rerank === true,
  };

  let ranked: MemoryCandidate[];
  if (options.caps !== undefined) {
    const selected = selectRetrieveCandidates(memories, query, {
      caps: options.caps,
      vectorScores: allVectorScores,
      links: options.links,
      filter: options.filter,
    });
    ranked = retrieveMemoriesFromPool(selected.pool, query, {
      ...rankOpts,
      vectorScores: useVector ? selected.vectorScores : undefined,
      ftsRanks: useFulltext ? selected.ftsRanks : undefined,
    });
  } else {
    ranked = retrieveMemoriesFromPool(memories, query, {
      ...rankOpts,
      vectorScores: useVector ? allVectorScores : undefined,
      ftsRanks:
        useFulltext && query.trim().length > 0
          ? (options.ftsRanks ?? ftsRanksForQuery(memories, query))
          : undefined,
    });
  }
  return jev ? ranked : ranked.slice(0, userLimit);
}

async function finishEvalRetrieve(
  query: string,
  ranked: MemoryCandidate[],
  options: RetrieveEvalOptions,
  userLimit: number,
  jev: boolean,
): Promise<MemoryCandidate[]> {
  const sliced = ranked.slice(0, userLimit);
  if (!jev) return sliced;
  const apiKey = resolvedEvalApiKey(options);
  if (apiKey === undefined) {
    if (options.requireJevKey) {
      throw new Error(EVAL_JEV_KEY_REQUIRED);
    }
    return sliced;
  }
  const referenceDate =
    options.nowMs === undefined
      ? undefined
      : new Date(options.nowMs).toISOString().slice(0, 10);
  return applyJevRetrieveGate({
    query,
    hits: ranked,
    apiKey,
    limit: userLimit,
    referenceDate,
    threshold: options.jevThreshold,
    evaluate: options.evaluate,
  });
}

export async function retrieveEval(
  memories: readonly MemoryWithTags[],
  query: string,
  options: RetrieveEvalOptions,
): Promise<MemoryCandidate[]> {
  const jev = evalWantsJev(options);
  const userLimit = options.limit ?? EVAL_K;
  const ranked = rankEvalRetrieve(memories, query, options);
  return finishEvalRetrieve(query, ranked, options, userLimit, jev);
}
