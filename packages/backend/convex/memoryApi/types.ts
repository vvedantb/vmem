/** API return shapes for memoryApi (plain strings; not engine branded unions). */

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
  /** Paragraph-level chunk that triggered the match (for UI highlight). */
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
