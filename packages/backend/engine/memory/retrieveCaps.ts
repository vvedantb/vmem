// Production retrieve candidate limits. Convex vectorSearch max is 256;
// FTS may scan 1024 and allows 16 terms per search expression. Recency is a
// ranking signal / empty-query source, not the search universe.

export const CONVEX_FTS_SCAN_MAX = 1024;
export const CONVEX_FTS_TERM_LIMIT = 16;

/** Docs to take from each Convex FTS query (under the 1024 scan cap). */
export const FTS_TAKE = 256;

/** Extra FTS searches for synonym terms beyond the original query. */
export const FTS_MAX_QUERIES = 2;

/** Convex `vectorSearch` limit (platform max 256; billed by index size, not k). */
export const VECTOR_CANDIDATE_LIMIT = 256;

/** Hard cap on docs we tokenize/rank after unioning index hits. */
export const RETRIEVE_RANK_POOL_CAP = 384;

/** Empty query + related-memories list + index-miss fallback. */
export const RETRIEVE_RECENT_CAP = 200;

/** 1–2 hop neighbors of FTS/vector seeds, fetched by memoryId. */
export const RETRIEVE_GRAPH_NEIGHBOR_LIMIT = 40;
export const RETRIEVE_GRAPH_MAX_HOPS = 2;

/** Pre-P0.1 production caps (last ~200 ∪ 32 FTS ∪ 32 vectors). */
export const LEGACY_FTS_TAKE = 32;
export const LEGACY_VECTOR_CANDIDATE_LIMIT = 32;
export const LEGACY_RETRIEVE_RECENT_CAP = 200;

export interface RetrieveCandidateCaps {
  recent: number;
  fts: number;
  vector: number;
  graphNeighbors: number;
  graphHops: number;
  rankPool: number;
}

export const LEGACY_RETRIEVE_CAPS: RetrieveCandidateCaps = {
  recent: LEGACY_RETRIEVE_RECENT_CAP,
  fts: LEGACY_FTS_TAKE,
  vector: LEGACY_VECTOR_CANDIDATE_LIMIT,
  graphNeighbors: 0,
  graphHops: 0,
  rankPool:
    LEGACY_RETRIEVE_RECENT_CAP +
    LEGACY_FTS_TAKE +
    LEGACY_VECTOR_CANDIDATE_LIMIT,
};

export const INDEX_RETRIEVE_CAPS: RetrieveCandidateCaps = {
  recent: 0,
  fts: FTS_TAKE,
  vector: VECTOR_CANDIDATE_LIMIT,
  graphNeighbors: RETRIEVE_GRAPH_NEIGHBOR_LIMIT,
  graphHops: RETRIEVE_GRAPH_MAX_HOPS,
  rankPool: RETRIEVE_RANK_POOL_CAP,
};

export function clampFtsTake(take: number): number {
  return Math.max(1, Math.min(CONVEX_FTS_SCAN_MAX, Math.floor(take)));
}

export function clampVectorLimit(limit: number): number {
  return Math.max(1, Math.min(VECTOR_CANDIDATE_LIMIT, Math.floor(limit)));
}
