/**
 * Memory service barrel.
 *
 * The single 4k-line `MemoryService` class was split into the `./memory/`
 * subdirectory in 2026-Q2. This file is now a pure re-export — every
 * symbol it surfaced before is still importable from `./memoryService`,
 * but the implementations live in topic-grouped modules:
 *
 *   types       — types.ts
 *   mappers     — mappers.ts
 *   shared      — shared.ts (withSession, logEvent, profileFilter, …)
 *   crud        — crud.ts
 *   chunks      — chunks.ts
 *   dedup       — dedup.ts
 *   search      — search.ts (BM25 only)
 *   retrieve    — retrieve.ts (hybrid BM25 + vector + chunk + graph + RRF)
 *   graph       — graph.ts
 *   relationships — relationships.ts
 *   proposals   — proposals.ts (decomposed resolveProposal)
 *   dreamMode   — dreamMode.ts
 *   enrichment  — enrichment.ts
 *   events      — events.ts
 *   stats       — stats.ts
 *   timeline    — timeline.ts
 *   connectors  — connectors.ts
 *   migration   — migration.ts (backfill/profile helpers)
 *   team        — team.ts
 */

export * from "./memory/types";
export {
  computeContentHash,
  recencyFromAgeDays,
  rrfScore,
  toEventFromNode,
  toMemoryTypeOrUndefined,
  toMemoryWithTags,
  toNeoInt,
  toSnapshot,
  toTagEdge,
  toTimelineEvent,
} from "./memory/mappers";
export {
  logEvent,
  profileFilter,
  visibleStatusClause,
  VISIBLE_STATUSES,
  withSession,
} from "./memory/shared";
export {
  createMemory,
  deleteAllMemoriesForUser,
  deleteMemoriesBySourceTypes,
  deleteMemory,
  findMemoryByContentHash,
  findMemoryByExternalId,
  findMemoryBySimilarity,
  findMemoryByTitleAndOrigin,
  findMemoryByUrl,
  finalizeDedupHit,
  getMemory,
  incrementVisitCount,
  listMemories,
  updateMemory,
} from "./memory/crud";
export {
  createChunksForMemory,
  deleteChunksForMemory,
  findUnchunkedLongMemories,
} from "./memory/chunks";
export {
  deduplicateBrowsingHistory,
  deduplicateMemories,
  deleteJunkSessionEdges,
  diagnoseDuplicates,
} from "./memory/dedup";
export { getRecentMemoryTitles, searchMemories } from "./memory/search";
export {
  expandViaGraph,
  fetchMemoryMetadata,
  retrieveMemories,
} from "./memory/retrieve";
export { getGraphData, getLocalGraph, getMemoryContent } from "./memory/graph";
export {
  getAllRelationships,
  getRelatedMemories,
  linkMemories,
  unlinkMemories,
} from "./memory/relationships";
export {
  createProposedDelete,
  createProposedUpdate,
  createSynthesisProposal,
  hasOverlappingPendingProposal,
  listProposedUpdates,
  resolveProposal,
} from "./memory/proposals";
export {
  computeSurprisalScore,
  fetchAnomalyCluster,
  findRecentMemoriesForDream,
  materializeSynthesisAsMemory,
} from "./memory/dreamMode";
export { applyEnrichment, applyEntitiesOnly } from "./memory/enrichment";
export { getMemoryEvents } from "./memory/events";
export { countMemoryEvents, getRecentActivity, getStats } from "./memory/stats";
export {
  getMemoryTimeline,
  getSearchTimeline,
  getTopicTimeline,
} from "./memory/timeline";
export { upsertFromSource } from "./memory/connectors";
export {
  countMemoriesByProfile,
  countMemoriesWithoutProfile,
  createSemanticEdgesForMemory,
  deleteMemoriesByProfile,
  listMissingContentHash,
  listMissingEmbeddings,
  listMissingEntities,
  listMissingSemanticEdges,
  markEntityExtracted,
  markSemanticEdgesProcessed,
  migrateMemoriesToProfile,
  moveMemoriesBetweenProfiles,
  setContentHashes,
  setEmbeddings,
} from "./memory/migration";
export {
  deleteTeamMemoryAsOwner,
  getMemoryForTeam,
  listMemoriesForTeam,
  searchMemoriesForTeam,
} from "./memory/team";
