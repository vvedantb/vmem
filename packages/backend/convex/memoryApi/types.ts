/** API return shapes for memoryApi — engine types where they match. */

export type {
  MemoryWithTags,
  MemoryCandidate,
  ScoreBreakdown,
  MatchedChunk,
  MemorySnapshot,
  MemoryEvent,
} from "../../engine/neo4j/memory/types";

import type {
  MemoryCandidate,
  MemoryWithTags,
} from "../../engine/neo4j/memory/types";

export interface MemoryListResult {
  memories: MemoryWithTags[];
  total: number;
}

export interface UserContext {
  aboutMe: string | null;
  preferences: string | null;
}

export interface RetrieveMemoriesResult {
  memories: MemoryCandidate[];
  userContext: UserContext;
}
