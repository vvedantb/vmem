// The memory wire shapes live in `@vmem/sdk` so the HTTP API, MCP tools, the
// engine and the SDK cannot drift. Only engine-internal shapes are declared here.
import type { MatchedChunk, MemoryWithTags } from "@vmem/sdk";

export type {
  GraphPathTrace,
  MatchedChunk,
  MemoryCandidate,
  MemoryNode,
  MemoryStatus,
  MemoryType,
  MemoryWithTags,
  ScoreBreakdown,
} from "@vmem/sdk";

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

export type ConnectionType = "tag" | "related";

export interface TimelineEvent extends MemoryEvent {
  memoryId: string;
  memoryTitle: string;
  connectionType?: ConnectionType;
}

export interface GraphExpansion {
  id: string;
  hops: number;
  seedCount: number;
  bridgingEntity: string | null;
  seedId: string | null;
}

export interface MergedEntry {
  memory: MemoryWithTags;
  fulltextScore: number;
  vectorScore: number;
  chunkScore: number;
  entityScore: number;
  recencyScore: number;
  confidenceScore: number;
  ftRank: number | null;
  vecRank: number | null;
  chunkRank: number | null;
  entityRank: number | null;
  graphRank: number | null;
  graphHops: number | null;
  seedCount: number;
  graphSeedId: string | null;
  graphSeedTitle: string | null;
  bridgingEntity: string | null;
  embedding: number[] | null;
  rerankerScore: number | null;
  matchedChunk: MatchedChunk | null;
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

export interface TagEdge {
  source: string;
  target: string;
  weight: number;
  sharedTags: string[];
}
