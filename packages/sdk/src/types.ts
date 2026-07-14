export type {
  AgentProposal,
  DeleteMemoryResult,
  HealthResult,
  MatchedChunk,
  MemoryCandidate,
  MemoryWithTags,
  RetrieveResult,
  ScoreBreakdown,
  StoreInstructionResult,
  UpdateInstructionResult,
  UserContext,
} from "./validators";

export interface StructuredCreateMemoryInput {
  title: string;
  content: string;
  type: string;
  source: string;
  tags?: string[];
  confidence?: number;
  expiresAt?: string;
  url?: string;
  profileId?: string;
  externalId?: string;
  sourceType?: string;
}

export interface StructuredPatchMemoryInput {
  id: string;
  title?: string;
  content?: string;
  type?: string;
  status?: string;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
}

export interface StructuredDeleteMemoryInput {
  id: string;
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
