/**
 * Backfill / one-shot migration helpers. All called from
 * `convex/neo4jActions/migration.ts`. Pure mechanics — the action layer
 * handles batching, progress reporting, and error classification.
 */

import neo4j, {
  type Driver,
  type QueryResult,
  type Record as NeoRecord,
} from "neo4j-driver";
import { neo4jGet, parseNeo4jInt } from "../record";
import { withSession } from "./shared";

export { createSemanticEdgesForMemory } from "./relationships";

function firstCount(result: QueryResult, key: string): number {
  const record = result.records[0];
  return record ? parseNeo4jInt(neo4jGet(record, key)) : 0;
}

function optionalProfileId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function stringField(record: NeoRecord, key: string): string {
  return String(neo4jGet(record, key) ?? "");
}

/** Shared core for the `mark*` resume-marker stamps: UNWIND ids, SET one
 *  datetime() property on each matched Memory. All three markers are
 *  otherwise byte-identical. */
async function stampMarker(
  driver: Driver,
  ids: string[],
  prop: string,
): Promise<void> {
  if (ids.length === 0) return;
  await withSession(driver, async (session) => {
    await session.run(
      `UNWIND $ids AS memId
       MATCH (m:Memory {id: memId})
       SET m.${prop} = datetime()`,
      { ids },
    );
  });
}

/** Shared core for the `set*` bulk backfill writers: one UNWIND round trip
 *  that copies `r.<prop>` from each row onto its Memory node. */
async function bulkSet(
  driver: Driver,
  rows: Array<Record<string, unknown>>,
  prop: string,
): Promise<void> {
  if (rows.length === 0) return;
  await withSession(driver, async (session) => {
    await session.run(
      `UNWIND $rows AS r
       MATCH (m:Memory {id: r.id})
       SET m.${prop} = r.${prop}`,
      { rows },
    );
  });
}

/** Shared core for the `count*` helpers: MATCH by props, optional WHERE,
 *  RETURN count(m) under the given alias. */
async function countMemories(
  driver: Driver,
  matchProps: Record<string, string>,
  whereClause: string | undefined,
  key: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const propsClause = Object.keys(matchProps)
      .map((k) => `${k}: $${k}`)
      .join(", ");
    const result = await session.run(
      `MATCH (m:Memory {${propsClause}})
       ${whereClause ? `WHERE ${whereClause}` : ""}
       RETURN count(m) AS ${key}`,
      matchProps,
    );
    return firstCount(result, key);
  });
}

/** Shared core for `listMissingEmbeddings`/`listMissingEntities`: identical
 *  {id, userId, profileId, title, content} projection, newest-first, only
 *  the WHERE clause differs. */
async function listMissingCommonFields(
  driver: Driver,
  whereClause: string,
  limit: number,
): Promise<
  Array<{
    id: string;
    userId: string;
    profileId: string | null;
    title: string;
    content: string;
  }>
> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory)
       WHERE ${whereClause}
       RETURN m.id AS id, m.userId AS userId, m.profileId AS profileId, m.title AS title, m.content AS content
       ORDER BY m.createdAt DESC
       LIMIT $limit`,
      { limit: neo4j.int(limit) },
    );
    return result.records.map((r) => ({
      id: stringField(r, "id"),
      userId: stringField(r, "userId"),
      profileId: optionalProfileId(neo4jGet(r, "profileId")),
      title: stringField(r, "title"),
      content: stringField(r, "content"),
    }));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile migration
// ─────────────────────────────────────────────────────────────────────────────

/** Count memories without profileId for a user. */
export async function countMemoriesWithoutProfile(
  driver: Driver,
  userId: string,
): Promise<number> {
  return countMemories(driver, { userId }, "m.profileId IS NULL", "count");
}

/** Count all memories for a profile. */
export async function countMemoriesByProfile(
  driver: Driver,
  userId: string,
  profileId: string,
): Promise<number> {
  return countMemories(driver, { userId, profileId }, undefined, "count");
}

/** Migrate all memories without profileId to a specific profile. */
export async function migrateMemoriesToProfile(
  driver: Driver,
  userId: string,
  profileId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.profileId IS NULL
       SET m.profileId = $profileId
       RETURN count(m) AS migrated`,
      { userId, profileId },
    );
    return firstCount(result, "migrated");
  });
}

/** Move memories from one profile to another. */
export async function moveMemoriesBetweenProfiles(
  driver: Driver,
  userId: string,
  fromProfileId: string,
  toProfileId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, profileId: $fromProfileId})
       SET m.profileId = $toProfileId
       RETURN count(m) AS moved`,
      { userId, fromProfileId, toProfileId },
    );
    return firstCount(result, "moved");
  });
}

/** Delete all memories for a profile. */
export async function deleteMemoriesByProfile(
  driver: Driver,
  userId: string,
  profileId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, profileId: $profileId})
       DETACH DELETE m
       RETURN count(m) AS deleted`,
      { userId, profileId },
    );
    return firstCount(result, "deleted");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding backfill
//
// Used by the one-shot migration in `convex/neo4jActions/migration.ts` to
// fill in `m.embedding` on memories that were created before vector search
// shipped, or created while the user had no OPENROUTER_API_KEY set.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a batch of memories that still have no embedding set. Ordered by
 * createdAt DESC so newest memories (most likely to be queried) get
 * embeddings first. Content is truncated in the JS layer by
 * `embeddingService.truncateForEmbedding` — no truncation here so callers
 * can choose their own strategy.
 */
export async function listMissingEmbeddings(
  driver: Driver,
  limit: number,
): Promise<
  Array<{
    id: string;
    userId: string;
    profileId: string | null;
    title: string;
    content: string;
  }>
> {
  return listMissingCommonFields(driver, "m.embedding IS NULL", limit);
}

/**
 * Bulk-set embeddings on existing memories by id. One round trip via
 * UNWIND to avoid N queries per batch.
 */
export async function setEmbeddings(
  driver: Driver,
  rows: Array<{ id: string; embedding: number[] }>,
): Promise<void> {
  return bulkSet(driver, rows, "embedding");
}

// ─────────────────────────────────────────────────────────────────────────────
// Content-hash backfill
//
// Used by the migration in `convex/neo4jActions/migration.ts` to retroactively
// compute and store contentHash for memories created before dedup shipped.
// Pure CPU work (MD5), no external API calls.
// ─────────────────────────────────────────────────────────────────────────────

/** Return memories that don't have a contentHash yet. */
export async function listMissingContentHash(
  driver: Driver,
  limit: number,
): Promise<Array<{ id: string; title: string; content: string }>> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory)
       WHERE m.contentHash IS NULL
       RETURN m.id AS id, m.title AS title, m.content AS content
       ORDER BY m.createdAt DESC
       LIMIT $limit`,
      { limit: neo4j.int(limit) },
    );
    return result.records.map((r) => ({
      id: stringField(r, "id"),
      title: stringField(r, "title"),
      content: stringField(r, "content"),
    }));
  });
}

/**
 * Bulk-set contentHash on existing memories by id. One round trip via
 * UNWIND to avoid N queries per batch.
 */
export async function setContentHashes(
  driver: Driver,
  rows: Array<{ id: string; contentHash: string }>,
): Promise<void> {
  return bulkSet(driver, rows, "contentHash");
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic edge backfill
//
// Used by the migration in `convex/neo4jActions/migration.ts` to retroactively
// create embedding-based RELATES_TO edges for memories that existed before
// auto-linking shipped. Mirrors the embedding backfill pattern.
// ─────────────────────────────────────────────────────────────────────────────

/** Return memories with embeddings that haven't been processed for semantic edges yet. */
export async function listMissingSemanticEdges(
  driver: Driver,
  limit: number,
): Promise<Array<{ id: string; userId: string; embedding: number[] }>> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory)
       WHERE m.embedding IS NOT NULL AND m.semanticEdgesAt IS NULL
       RETURN m.id AS id, m.userId AS userId, m.embedding AS embedding
       ORDER BY m.createdAt DESC
       LIMIT $limit`,
      { limit: neo4j.int(limit) },
    );
    return result.records.flatMap((r) => {
      const rawEmbedding = neo4jGet(r, "embedding");
      if (!Array.isArray(rawEmbedding)) return [];
      const embedding: number[] = rawEmbedding.filter(
        (x): x is number => typeof x === "number",
      );
      if (embedding.length === 0) return [];
      return [
        {
          id: stringField(r, "id"),
          userId: stringField(r, "userId"),
          embedding,
        },
      ];
    });
  });
}

/** Mark memories as processed for semantic edges so the backfill skips them. */
export async function markSemanticEdgesProcessed(
  driver: Driver,
  ids: string[],
): Promise<void> {
  return stampMarker(driver, ids, "semanticEdgesAt");
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity backfill
// ─────────────────────────────────────────────────────────────────────────────

/** List memories that have not had entity extraction run yet. */
export async function listMissingEntities(
  driver: Driver,
  limit: number,
): Promise<
  Array<{
    id: string;
    userId: string;
    profileId: string | null;
    title: string;
    content: string;
  }>
> {
  return listMissingCommonFields(
    driver,
    "m.entityExtractedAt IS NULL AND coalesce(m.status, 'active') IN ['active', 'pinned']",
    limit,
  );
}

/** Mark memories as processed for entity extraction. */
export async function markEntityExtracted(
  driver: Driver,
  ids: string[],
): Promise<void> {
  return stampMarker(driver, ids, "entityExtractedAt");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag consolidation re-tag (2026-06: collapse legacy one-off tags)
//
// The pre-vocabulary enrichment prompt minted hyper-specific single-use tags
// (73% of one account's 4,962 tags). These helpers drive a one-shot re-tag:
// `retagMemoriesInternal` re-runs the (now vocabulary-aware) tagging prompt
// per memory and replaces its TAGGED_WITH edges. `m.retaggedAt` is the
// resume marker.
// ─────────────────────────────────────────────────────────────────────────────

/** Batch of a user's memories not yet re-tagged, oldest first (the oldest
 *  carry the worst legacy tags, and re-tagging them first builds vocabulary
 *  usage counts that later batches then reuse). Includes current tags so
 *  dry runs can show before/after. */
export async function listUnretagged(
  driver: Driver,
  userId: string,
  limit: number,
): Promise<
  Array<{
    id: string;
    profileId: string | null;
    title: string;
    content: string;
    tags: string[];
  }>
> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.retaggedAt IS NULL
         AND coalesce(m.status, 'active') IN ['active', 'pinned']
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       WITH m, collect(t.name) AS tags
       ORDER BY m.createdAt ASC
       LIMIT $limit
       RETURN m.id AS id, m.profileId AS profileId, m.title AS title,
              m.content AS content, tags`,
      { userId, limit: neo4j.int(limit) },
    );
    return result.records.map((r) => {
      const rawTags = neo4jGet(r, "tags");
      return {
        id: stringField(r, "id"),
        profileId: optionalProfileId(neo4jGet(r, "profileId")),
        title: stringField(r, "title"),
        content: stringField(r, "content"),
        tags: Array.isArray(rawTags) ? rawTags.map(String) : [],
      };
    });
  });
}

export async function countUnretagged(
  driver: Driver,
  userId: string,
): Promise<number> {
  return countMemories(
    driver,
    { userId },
    "m.retaggedAt IS NULL AND coalesce(m.status, 'active') IN ['active', 'pinned']",
    "n",
  );
}

/** Replace a memory's TAGGED_WITH edges and stamp the resume marker in one
 *  transaction. Tags must already be normalized by the caller. */
export async function replaceTagsAndMarkRetagged(
  driver: Driver,
  memoryId: string,
  userId: string,
  tags: string[],
): Promise<void> {
  await withSession(driver, async (session) => {
    await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})
       OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
       DELETE r
       WITH DISTINCT m
       FOREACH (tagName IN $tags |
         MERGE (t:Tag {name: tagName})
         MERGE (m)-[:TAGGED_WITH]->(t)
       )
       SET m.retaggedAt = datetime()`,
      { memoryId, userId, tags },
    );
  });
}

/** Stamp the resume marker without touching tags (LLM/parse failure path —
 *  the memory keeps its legacy tags rather than retrying forever). */
export async function markRetaggedOnly(
  driver: Driver,
  ids: string[],
): Promise<void> {
  return stampMarker(driver, ids, "retaggedAt");
}

/** Delete Tag nodes no memory points at any more (post-re-tag sweep). */
export async function deleteOrphanTags(driver: Driver): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (t:Tag)
       WHERE NOT (t)<-[:TAGGED_WITH]-()
       DETACH DELETE t
       RETURN count(t) AS deleted`,
    );
    return firstCount(result, "deleted");
  });
}
