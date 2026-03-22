export type MemoryType = "profile" | "episodic" | "knowledge";
export type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

export interface MemoryNode {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  confidence: number;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface MemoryWithTags extends MemoryNode {
  tags: string[];
}

export interface ScoreBreakdown {
  fulltext: number;
  recency: number;
  confidence: number;
}

export interface MemoryCandidate extends MemoryWithTags {
  trace: {
    score: number;
    scoreBreakdown: ScoreBreakdown;
    reason: string;
  };
}

export interface CreateMemoryParams {
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
}

export interface RetrieveParams {
  query: string;
  type?: MemoryType;
  tags?: string[];
  limit?: number;
}

export interface RetrieveResponse {
  memories: MemoryCandidate[];
}

export interface ListResponse {
  memories: MemoryWithTags[];
  total: number;
}
