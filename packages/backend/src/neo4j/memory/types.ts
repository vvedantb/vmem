/**
 * Shared types for the memory service. Pure type extraction — no runtime
 * helpers other than the `ProposedUpdateKind` set + type-guard, which are
 * tightly coupled to the kind union.
 */

export type MemoryType = "profile" | "episodic" | "knowledge";
export type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

export interface MemoryNode {
  id: string;
  userId: string;
  profileId: string | null;
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

export interface ScoreBreakdown {
  fulltext: number;
  vector: number;
  chunk: number;
  entity: number;
  rrf: number;
  recency: number;
  confidence: number;
  graphPath?: GraphPathTrace;
  rerankerScore?: number;
}

export interface MatchedChunk {
  /** Chunk text content — the passage that matched. */
  content: string;
  /** 0-indexed position within the parent memory (for "result 3 of 12" style UX). */
  position: number;
}

export interface MemoryCandidate extends MemoryWithTags {
  trace: {
    score: number;
    scoreBreakdown: ScoreBreakdown;
    reason: string;
  };
  /**
   * When the retrieval was driven (or augmented) by a paragraph-level
   * chunk match instead of the whole-memory embedding, the matched chunk
   * is surfaced here so UIs can show which passage of a long article
   * triggered the match. Absent when retrieval matched on the whole
   * memory only.
   */
  matchedChunk?: MatchedChunk;
}

export interface GraphExpansion {
  id: string;
  hops: number;
  seedCount: number;
  bridgingEntity: string | null;
  seedId: string | null;
}

export interface GraphPathTrace {
  seedTitle: string;
  bridgingEntity: string | null;
  hops: number;
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

/**
 * Kind of proposal:
 * - "update": replace `memory.content` with `proposedContent` on approve.
 * - "delete": delete the memory on approve. `proposedContent` is empty
 *    string; UI uses the linked memory's current content for the diff.
 * - "insight": Dream Mode synthesized a pattern across multiple memories.
 *    Approve creates a NEW :Memory + :DERIVED_FROM edges to sources.
 * - "connection": Bridge across two+ memories that share an entity/theme
 *    but weren't explicitly linked. Approve creates a NEW :Memory.
 * - "contradiction": Two memories disagree. V1 dismiss-only (user
 *    manually resolves the underlying conflict). No new memory on
 *    approve in V1 — this is informational.
 * - "anomaly": A single memory stands out from related memories. Approve
 *    creates a NEW :Memory summarizing the anomaly.
 */
export type ProposedUpdateKind =
  | "update"
  | "delete"
  | "insight"
  | "connection"
  | "contradiction"
  | "anomaly";

export const ALL_PROPOSED_UPDATE_KINDS: ReadonlySet<string> = new Set<string>([
  "update",
  "delete",
  "insight",
  "connection",
  "contradiction",
  "anomaly",
]);

export function isProposedUpdateKind(
  value: string,
): value is ProposedUpdateKind {
  return ALL_PROPOSED_UPDATE_KINDS.has(value);
}

/** Origin of a proposal — used for attribution + filtering in the UI/audit log. */
export type ProposalSource = "v2-extraction" | "dream-mode";

export interface ProposedUpdateNode {
  id: string;
  /**
   * Target memory the proposal is "about" (update/delete: the one being
   * mutated; synthesis: the primary source memory). Empty string for
   * synthesis proposals that aren't tied to a single memory — callers
   * should use `sourceMemoryIds` instead in those cases.
   */
  memoryId: string;
  /** New body for update kind / synthesized text for synthesis kinds / "" for delete. */
  proposedContent: string;
  /**
   * Synthesis proposals carry their own title (a new memory needs one);
   * update/delete proposals leave this null and reuse the target's title.
   */
  proposedTitle: string | null;
  reason: string;
  /**
   * Default "update" for proposals created before V2 (the field is
   * absent on those Neo4j nodes; we coerce on read). New proposals
   * always set kind explicitly.
   */
  kind: ProposedUpdateKind;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  /**
   * Memory IDs the proposal derives from. Empty array for legacy
   * update/delete proposals (those reuse `memoryId` as the single source).
   * Synthesis proposals always have ≥1 entry.
   */
  sourceMemoryIds: string[];
  /** LLM-reported confidence 0..1. Null on legacy update/delete proposals. */
  confidence: number | null;
  /** Where this proposal came from. Defaults to "v2-extraction" on legacy rows. */
  source: ProposalSource;
  /**
   * Snapshot of the target memory at list time. Lets the proposals UI
   * render the old text for a diff (UPDATE) or the body to be deleted
   * (DELETE) without an extra round-trip per proposal. Null when the
   * memory is missing (extremely rare — the UPDATE_FOR edge ought to
   * keep them paired; but a concurrent delete mid-query would do it),
   * or when the proposal is a synthesis kind not bound to a single target.
   */
  memorySnapshot: { title: string; content: string } | null;
  /**
   * Title + content snapshots of the source memories. Populated for
   * synthesis proposals so the UI can render the "derived from N
   * memories" panel without an extra round-trip per source. Empty for
   * non-synthesis proposals.
   */
  sourceMemorySnapshots: { id: string; title: string; content: string }[];
}

export interface TagEdge {
  source: string;
  target: string;
  weight: number;
  sharedTags: string[];
}
