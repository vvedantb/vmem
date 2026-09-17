import type { MemoryWithTags } from "@vmem/sdk";
import { expandGraphNeighbors, type MemoryLinkEdge } from "./links";
import { memoryMatchesListFilter, type MemoryListFilter } from "./list";
import {
  CONVEX_FTS_TERM_LIMIT,
  FTS_MAX_QUERIES,
  type RetrieveCandidateCaps,
} from "./retrieveCaps";
import { expandQueryTerms } from "./synonyms";
import { contentTokens, tokenize, uniqueTokens } from "./tokens";

export interface RetrieveCandidateSelection {
  pool: MemoryWithTags[];
  ftsRanks: Map<string, number>;
  vectorScores: Map<string, number>;
  ftsRankOf: Map<string, number>;
  vectorRankOf: Map<string, number>;
  recencyRankOf: Map<string, number>;
}

function addIfRoom(
  byId: Map<string, MemoryWithTags>,
  memory: MemoryWithTags,
  cap: number,
): void {
  if (byId.has(memory.id) || byId.size >= cap) return;
  byId.set(memory.id, memory);
}

export function ftsQueryTexts(query: string): string[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const original = uniqueTokens(tokenize(trimmed));
  if (original.length === 0) return [];
  const expanded = expandQueryTerms(trimmed);
  const originalSet = new Set(original);
  const extras: string[] = [];
  for (const term of expanded) {
    if (originalSet.has(term)) continue;
    extras.push(term);
  }

  const batches: string[] = [];
  const push = (terms: readonly string[]): void => {
    for (let i = 0; i < terms.length; i += CONVEX_FTS_TERM_LIMIT) {
      if (batches.length >= FTS_MAX_QUERIES) return;
      const slice = terms.slice(i, i + CONVEX_FTS_TERM_LIMIT);
      if (slice.length === 0) continue;
      batches.push(slice.join(" "));
    }
  };
  push(original);
  if (batches.length < FTS_MAX_QUERIES) push(extras);
  return batches;
}

function ftsTfScore(
  memory: Pick<MemoryWithTags, "title" | "content" | "tags">,
  queryTerms: readonly string[],
): number {
  if (queryTerms.length === 0) return 0;
  const wanted = new Set(queryTerms);
  const tokens = contentTokens(
    `${memory.title} ${memory.content} ${memory.tags.join(" ")}`,
    false,
  );
  let tf = 0;
  for (const token of tokens) {
    if (wanted.has(token)) tf += 1;
  }
  return tf;
}

export function rankedFtsHits(
  memories: readonly MemoryWithTags[],
  query: string,
): Array<{ memory: MemoryWithTags; tf: number }> {
  const terms = expandQueryTerms(query);
  if (terms.length === 0) return [];
  const scored: Array<{ memory: MemoryWithTags; tf: number }> = [];
  for (const memory of memories) {
    const tf = ftsTfScore(memory, terms);
    if (tf <= 0) continue;
    scored.push({ memory, tf });
  }
  scored.sort((a, b) => {
    if (b.tf !== a.tf) return b.tf - a.tf;
    return Date.parse(b.memory.updatedAt) - Date.parse(a.memory.updatedAt);
  });
  return scored;
}

function rankedRecent(memories: readonly MemoryWithTags[]): MemoryWithTags[] {
  return [...memories].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
}

function rankedVectorHits(
  memories: readonly MemoryWithTags[],
  vectorScores: ReadonlyMap<string, number>,
): Array<{ memory: MemoryWithTags; score: number }> {
  const scored: Array<{ memory: MemoryWithTags; score: number }> = [];
  for (const memory of memories) {
    const score = vectorScores.get(memory.id) ?? 0;
    if (score <= 0) continue;
    scored.push({ memory, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function selectRetrieveCandidates(
  memories: readonly MemoryWithTags[],
  query: string,
  options: {
    caps: RetrieveCandidateCaps;
    vectorScores?: ReadonlyMap<string, number>;
    links?: readonly MemoryLinkEdge[];
    filter?: MemoryListFilter;
  },
): RetrieveCandidateSelection {
  const filter = options.filter ?? {};
  const filtered = memories.filter((memory) =>
    memoryMatchesListFilter(memory, filter),
  );
  const cap = Math.max(1, options.caps.rankPool);
  const byId = new Map<string, MemoryWithTags>();
  const ftsRankOf = new Map<string, number>();
  const vectorRankOf = new Map<string, number>();
  const recencyRankOf = new Map<string, number>();
  const ftsRanks = new Map<string, number>();
  const poolVectorScores = new Map<string, number>();

  const recent = rankedRecent(filtered);
  for (let i = 0; i < recent.length; i += 1) {
    const memory = recent[i];
    if (memory === undefined) continue;
    recencyRankOf.set(memory.id, i + 1);
    if (i < options.caps.recent) addIfRoom(byId, memory, cap);
  }

  const ftsHits = rankedFtsHits(filtered, query);
  const ftsTake = Math.max(0, options.caps.fts);
  for (let i = 0; i < ftsHits.length; i += 1) {
    const row = ftsHits[i];
    if (row === undefined) continue;
    ftsRankOf.set(row.memory.id, i + 1);
    if (i >= ftsTake) continue;
    addIfRoom(byId, row.memory, cap);
    ftsRanks.set(row.memory.id, 1 / (i + 1));
  }

  const vectorHits = rankedVectorHits(
    filtered,
    options.vectorScores ?? new Map(),
  );
  const vectorTake = Math.max(0, options.caps.vector);
  for (let i = 0; i < vectorHits.length; i += 1) {
    const row = vectorHits[i];
    if (row === undefined) continue;
    vectorRankOf.set(row.memory.id, i + 1);
    if (i >= vectorTake) continue;
    addIfRoom(byId, row.memory, cap);
    poolVectorScores.set(row.memory.id, row.score);
  }

  if (
    options.caps.graphNeighbors > 0 &&
    options.caps.graphHops > 0 &&
    options.links !== undefined &&
    options.links.length > 0 &&
    byId.size > 0
  ) {
    const seedIds = [...byId.keys()];
    const seedTitleById = new Map(
      [...byId.values()].map((memory) => [memory.id, memory.title]),
    );
    const neighbors = expandGraphNeighbors(
      seedIds,
      seedTitleById,
      options.links,
      options.caps.graphNeighbors,
      options.caps.graphHops,
    );
    const byMemoryId = new Map(filtered.map((memory) => [memory.id, memory]));
    for (const neighbor of neighbors) {
      const memory = byMemoryId.get(neighbor.id);
      if (memory === undefined) continue;
      addIfRoom(byId, memory, cap);
    }
  }

  return {
    pool: [...byId.values()],
    ftsRanks,
    vectorScores: poolVectorScores,
    ftsRankOf,
    vectorRankOf,
    recencyRankOf,
  };
}
