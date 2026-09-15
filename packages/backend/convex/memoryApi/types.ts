import type {
  MemoryCandidate,
  MemoryType,
  MemoryWithTags,
  MatchedChunk,
  ScoreBreakdown,
} from "@vmem/sdk";

export type {
  MemoryWithTags,
  MemoryCandidate,
  MemoryType,
  ScoreBreakdown,
  MatchedChunk,
};

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

export interface TimelineEvent extends MemoryEvent {
  memoryId: string;
  memoryTitle: string;
  connectionType?: "tag" | "related";
}

export const PROPOSED_UPDATE_KINDS = [
  "update",
  "delete",
  "insight",
  "connection",
  "contradiction",
  "anomaly",
  "merge",
] as const;

export type ProposedUpdateKind = (typeof PROPOSED_UPDATE_KINDS)[number];

export type ProposalSource = "v2-extraction" | "dream-mode";

export interface ProposedUpdateNode {
  id: string;
  memoryId: string;
  proposedContent: string;
  proposedTitle: string | null;
  reason: string;
  kind: ProposedUpdateKind;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  sourceMemoryIds: string[];
  confidence: number | null;
  source: ProposalSource;
  memorySnapshot: { title: string; content: string } | null;
  sourceMemorySnapshots: { id: string; title: string; content: string }[];
}
