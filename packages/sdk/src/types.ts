export type {
  AgentProposal,
  DeleteMemoryResult,
  HealthResult,
  MatchedChunk,
  MemoryCandidate,
  MemoryStatus,
  MemoryType,
  MemoryWithTags,
  RetrieveResult,
  ScoreBreakdown,
  StoreInstructionResult,
  UpdateInstructionResult,
  UserContext,
} from "./contract";
import type {
  DeleteBody,
  RetrieveBody,
  StructuredStoreBody,
  StructuredUpdateBody,
} from "./contract";

// Friendlier names for the structured request bodies the client accepts.
export type StructuredCreateMemoryInput = StructuredStoreBody;
export type StructuredPatchMemoryInput = StructuredUpdateBody;
export type StructuredDeleteMemoryInput = DeleteBody;
export type StructuredRetrieveInput = RetrieveBody;

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
