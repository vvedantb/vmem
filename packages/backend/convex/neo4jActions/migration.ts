"use node";

/**
 * Barrel for memory migration / backfill internal actions.
 * Bodies live in `./migration/*` grouped by concern.
 */

export {
  migrateMemoriesToDefaultProfile,
  countMemoriesWithoutProfile,
  countMemoriesByProfile,
  moveMemoriesBetweenProfiles,
  deleteMemoriesByProfile,
  deleteJunkSessionEdges,
} from "./migration/profiles";

export {
  backfillEmbeddingsInternal,
  startEmbeddingBackfill,
  backfillSemanticEdgesInternal,
  startSemanticEdgesBackfill,
  backfillEntitiesInternal,
  startEntityBackfill,
  backfillContentHashInternal,
  startContentHashBackfill,
} from "./migration/backfill";

export {
  deduplicateMemories,
  diagnoseDuplicates,
  deduplicateBrowsingHistory,
} from "./migration/dedup";
