export type MemoryType = "profile" | "episodic" | "knowledge";
export type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

export interface MemoryNode {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string; // Convex returns string, narrowed at runtime
  source: string;
  confidence: number;
  status: string; // Convex returns string, narrowed at runtime
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
  type: string;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  profileId?: string;
}

export interface Profile {
  _id: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
}

export interface RetrieveParams {
  query: string;
  type?: string;
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
