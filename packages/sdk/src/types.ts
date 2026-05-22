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
  matchedChunk?: MatchedChunk;
}

export interface UserContext {
  aboutMe: string | null;
  preferences: string | null;
}

export interface RetrieveResult {
  memories: MemoryCandidate[];
  userContext: UserContext;
  summary?: string;
}

export interface AgentProposal {
  id: string;
  memoryId: string;
  proposedContent: string;
  reason: string;
  kind: string;
  status: string;
}

export interface StoreInstructionResult {
  created: MemoryWithTags[];
  summary: string;
}

export interface UpdateInstructionResult {
  applied: MemoryWithTags[];
  proposals: AgentProposal[];
  summary: string;
}

export interface StructuredCreateMemoryInput {
  title: string;
  content: string;
  type: string;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  profileId?: string;
  externalId?: string;
  sourceType?: string;
}

export interface StructuredPatchMemoryInput {
  memoryId: string;
  title?: string;
  content?: string;
  type?: string;
  status?: string;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
}

export interface StructuredRetrieveInput {
  query: string;
  limit?: number;
  type?: string;
  tags?: string[];
  profileId?: string;
  summarize?: boolean;
}

export interface VMemoryOptions {
  apiKey?: string;
  baseUrl?: string;
  profileId?: string;
}

export interface VMemoryRequestOptions {
  profileId?: string;
}

export interface ApiErrorBody {
  error: string;
  issues?: Array<{
    path: Array<string | number>;
    message: string;
  }>;
}
