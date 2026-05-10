/**
 * Backfill / one-shot migration helpers. All called from
 * `convex/neo4jActions/migration.ts`. Pure mechanics — the action layer
 * handles batching, progress reporting, and error classification.
 */

import neo4j, { type Driver } from "neo4j-driver";
import { toNeoInt } from "./mappers";
import { withSession } from "./shared";

// ─────────────────────────────────────────────────────────────────────────────
// Profile migration
// ─────────────────────────────────────────────────────────────────────────────

/** Count memories without profileId for a user. */
export async function countMemoriesWithoutProfile(
  driver: Driver,
  userId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.profileId IS NULL
       RETURN count(m) AS count`,
      { userId },
    );
    const record = result.records[0];
    return record ? toNeoInt(record.get("count")) : 0;
  });
}

/** Count all memories for a profile. */
export async function countMemoriesByProfile(
  driver: Driver,
  userId: string,
  profileId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, profileId: $profileId})
       RETURN count(m) AS count`,
      { userId, profileId },
    );
    const record = result.records[0];
    return record ? toNeoInt(record.get("count")) : 0;
  });
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
    const record = result.records[0];
    return record ? toNeoInt(record.get("migrated")) : 0;
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
    const record = result.records[0];
    return record ? toNeoInt(record.get("moved")) : 0;
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
    const record = result.records[0];
    return record ? toNeoInt(record.get("deleted")) : 0;
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
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory)
       WHERE m.embedding IS NULL
       RETURN m.id AS id, m.userId AS userId, m.profileId AS profileId, m.title AS title, m.content AS content
       ORDER BY m.createdAt DESC
       LIMIT $limit`,
      { limit: neo4j.int(limit) },
    );
    return result.records.map((r) => {
      const rawProfileId = r.get("profileId");
      return {
        id: String(r.get("id")),
        userId: String(r.get("userId")),
        profileId:
          typeof rawProfileId === "string" && rawProfileId.length > 0
            ? rawProfileId
            : null,
        title: String(r.get("title")),
        content: String(r.get("content")),
      };
    });
  });
}

/**
 * Bulk-set embeddings on existing memories by id. One round trip via
 * UNWIND to avoid N queries per batch.
 */
export async function setEmbeddings(
  driver: Driver,
  rows: Array<{ id: string; embedding: number[] }>,
): Promise<void> {
  if (rows.length === 0) return;
  await withSession(driver, async (session) => {
    await session.run(
      `UNWIND $rows AS r
       MATCH (m:Memory {id: r.id})
       SET m.embedding = r.embedding`,
      { rows },
    );
  });
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
      id: String(r.get("id")),
      title: String(r.get("title")),
      content: String(r.get("content")),
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
  if (rows.length === 0) return;
  await withSession(driver, async (session) => {
    await session.run(
      `UNWIND $rows AS r
       MATCH (m:Memory {id: r.id})
       SET m.contentHash = r.contentHash`,
      { rows },
    );
  });
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
    return result.records.map((r) => ({
      id: String(r.get("id")),
      userId: String(r.get("userId")),
      embedding: r.get("embedding") as number[],
    }));
  });
}

/** Create semantic similarity edges for a single memory using the vector index. */
export async function createSemanticEdgesForMemory(
  driver: Driver,
  memoryId: string,
  userId: string,
  embedding: number[],
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
       YIELD node AS candidate, score AS similarity
       WHERE candidate.userId = $userId
         AND candidate.id <> $id
         AND similarity >= $threshold
       WITH candidate, similarity
       ORDER BY similarity DESC
       LIMIT $limit
       MATCH (m:Memory {id: $id})
       MERGE (m)-[r:RELATES_TO]->(candidate)
       ON CREATE SET r.reason = 'semantic similarity', r.score = similarity
       RETURN count(r) AS created`,
      {
        k: neo4j.int(20),
        embedding,
        userId,
        id: memoryId,
        threshold: 0.78,
        limit: neo4j.int(5),
      },
    );
    const record = result.records[0];
    return record ? toNeoInt(record.get("created")) : 0;
  });
}

/** Mark memories as processed for semantic edges so the backfill skips them. */
export async function markSemanticEdgesProcessed(
  driver: Driver,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await withSession(driver, async (session) => {
    await session.run(
      `UNWIND $ids AS memId
       MATCH (m:Memory {id: memId})
       SET m.semanticEdgesAt = datetime()`,
      { ids },
    );
  });
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
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory)
       WHERE m.entityExtractedAt IS NULL
         AND coalesce(m.status, 'active') IN ['active', 'pinned']
       RETURN m.id AS id, m.userId AS userId, m.profileId AS profileId, m.title AS title, m.content AS content
       ORDER BY m.createdAt DESC
       LIMIT $limit`,
      { limit: neo4j.int(limit) },
    );
    return result.records.map((r) => {
      const rawProfileId = r.get("profileId");
      return {
        id: String(r.get("id")),
        userId: String(r.get("userId")),
        profileId:
          typeof rawProfileId === "string" && rawProfileId.length > 0
            ? rawProfileId
            : null,
        title: String(r.get("title")),
        content: String(r.get("content") ?? ""),
      };
    });
  });
}

/** Mark memories as processed for entity extraction. */
export async function markEntityExtracted(
  driver: Driver,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await withSession(driver, async (session) => {
    await session.run(
      `UNWIND $ids AS memId
       MATCH (m:Memory {id: memId})
       SET m.entityExtractedAt = datetime()`,
      { ids },
    );
  });
}
