/**
 * External-source connector ingestion. Single caller
 * (`convex/neo4jActions/connectors.ts`) — Drive, Notion, etc. all funnel
 * through `upsertFromSource`.
 */

import crypto from "node:crypto";
import { type Driver } from "neo4j-driver";
import { createSemanticSimilarityEdges } from "./relationships";
import { withSession } from "./shared";

/**
 * Upsert a memory from an external source (Google Drive, Notion, etc.).
 * Uses MERGE on (userId, sourceType, sourceId) to avoid duplicates.
 * Creates new memory if not exists, updates content if exists.
 */
export async function upsertFromSource(
  driver: Driver,
  params: {
    userId: string;
    profileId: string;
    title: string;
    content: string;
    sourceType: string;
    sourceId: string;
    sourceUrl: string;
    // Pre-computed embedding vector. Applied on BOTH create and match — an
    // updated upstream document should refresh its semantic signal, not just
    // its text. Null ⇒ caller had no API key or embedding failed; memory
    // still upserts, backfill migration can repair later.
    embedding: number[] | null;
  },
): Promise<{ id: string; created: boolean }> {
  return withSession(driver, async (session) => {
    const now = new Date().toISOString();

    const result = await session.run(
      `MERGE (m:Memory {userId: $userId, sourceType: $sourceType, sourceId: $sourceId})
       ON CREATE SET
         m.id = $newId,
         m.profileId = $profileId,
         m.title = $title,
         m.content = $content,
         m.type = 'knowledge',
         m.source = $sourceType,
         m.confidence = 0.8,
         m.status = 'active',
         m.createdAt = $now,
         m.updatedAt = $now,
         m.sourceUrl = $sourceUrl,
         m.sourceSyncedAt = $now,
         m.embedding = $embedding
       ON MATCH SET
         m.title = $title,
         m.content = $content,
         m.updatedAt = $now,
         m.sourceUrl = $sourceUrl,
         m.sourceSyncedAt = $now,
         m.embedding = $embedding
       WITH m, m.createdAt = $now AS wasCreated
       MERGE (s:Source {name: $sourceType})
       MERGE (m)-[:FROM_SOURCE]->(s)
       RETURN m.id AS id, wasCreated`,
      {
        userId: params.userId,
        profileId: params.profileId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        sourceUrl: params.sourceUrl,
        title: params.title,
        content: params.content,
        newId: crypto.randomUUID(),
        now,
        embedding: params.embedding,
      },
    );

    const firstRecord = result.records[0];
    if (!firstRecord) throw new Error("Failed to upsert memory from source");

    const memoryId = String(firstRecord.get("id"));
    const wasCreated = Boolean(firstRecord.get("wasCreated"));

    // Semantic similarity edges on new memory creation (not updates)
    if (wasCreated && params.embedding !== null) {
      await createSemanticSimilarityEdges(
        session,
        memoryId,
        params.userId,
        params.embedding,
      );
    }

    return { id: memoryId, created: wasCreated };
  });
}
