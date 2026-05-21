/**
 * Shared return-shape interfaces for `memoryApi.ts`. Kept identical to
 * the pre-split shape so existing `FunctionReturnType<typeof api.…>`
 * usages on the frontend keep resolving to the same types. Diverges
 * intentionally from `src/neo4j/memory/types` — those carry branded
 * unions and a `profileId` field; the API surface keeps `type`/`status`
 * as plain strings to avoid leaking the branding into 16 caller files.
 */

export interface MemoryWithTags {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  source: string;
  confidence: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  tags: string[];
}

export interface MemoryListResult {
  memories: MemoryWithTags[];
  total: number;
}

export interface ScoreBreakdown {
  fulltext: number;
  vector: number;
  chunk: number;
  entity: number;
  rrf: number;
  recency: number;
  confidence: number;
  graphPath?: {
    seedTitle: string;
    bridgingEntity: string | null;
    hops: number;
  };
  rerankerScore?: number;
}

export interface MatchedChunk {
  content: string;
  position: number;
}

export interface MemoryCandidate extends MemoryWithTags {
  trace: {
    score: number;
    scoreBreakdown: ScoreBreakdown;
    reason: string;
  };
  /**
   * Set when retrieval matched a paragraph-level chunk inside a long memory
   * instead of (or in addition to) the whole-memory embedding. UIs can use
   * this to highlight the specific passage that triggered the match.
   */
  matchedChunk?: MatchedChunk;
}

export interface UserContext {
  aboutMe: string | null;
  preferences: string | null;
}

export interface RetrieveMemoriesResult {
  memories: MemoryCandidate[];
  userContext: UserContext;
}

export interface MemorySnapshot {
  title: string;
  content: string;
  type: string;
  status: string;
  confidence: number;
  tags: string[];
}

export interface MemoryEvent {
  id: string;
  action: string;
  actor: string;
  details: Record<string, string> | null;
  snapshot: MemorySnapshot | null;
  createdAt: string;
}
