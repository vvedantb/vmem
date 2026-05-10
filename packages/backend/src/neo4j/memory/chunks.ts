/**
 * Chunk lifecycle for long memories. The retrieve path's chunk-leg fans out
 * to (m)-[:HAS_CHUNK]->(c:Chunk) so semantic search can hit a paragraph
 * inside a long memory. Single caller is `convex/neo4jActions/memories.ts`
 * (chunk-rebuild path on content change + one-shot backfill).
 */

import crypto from "node:crypto";
import neo4j, { type Driver } from "neo4j-driver";
import { withSession } from "./shared";

export async function createChunksForMemory(
  driver: Driver,
  params: {
    memoryId: string;
    userId: string;
    chunks: { content: string; startOffset: number; endOffset: number }[];
    embeddings: (number[] | null)[];
  },
): Promise<void> {
  if (params.chunks.length === 0) return;
  return withSession(driver, async (session) => {
    const now = new Date().toISOString();
    const rows = params.chunks.map((chunk, idx) => ({
      id: crypto.randomUUID(),
      position: idx,
      content: chunk.content,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      embedding: params.embeddings[idx] ?? null,
    }));
    await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})
       UNWIND $rows AS row
       CREATE (c:Chunk {
         id: row.id,
         memoryId: $memoryId,
         userId: $userId,
         position: row.position,
         content: row.content,
         startOffset: row.startOffset,
         endOffset: row.endOffset,
         embedding: row.embedding,
         createdAt: $now
       })
       CREATE (m)-[:HAS_CHUNK {position: row.position}]->(c)`,
      {
        memoryId: params.memoryId,
        userId: params.userId,
        rows,
        now,
      },
    );
  });
}

/**
 * Delete all chunks for a memory. Used by the chunk-rebuild path when a
 * memory's content changes and chunks need re-emitting. The standalone
 * `deleteMemory` already inlines this query so the cleanup is local.
 */
export async function deleteChunksForMemory(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<void> {
  return withSession(driver, async (session) => {
    await session.run(
      `MATCH (c:Chunk {memoryId: $memoryId, userId: $userId})
       DETACH DELETE c`,
      { memoryId, userId },
    );
  });
}

/**
 * Return memories whose `content` exceeds the given length and that have
 * not yet been chunked (no outgoing `HAS_CHUNK` edge). Used by the
 * one-shot backfill action to chunk pre-existing long memories.
 */
export async function findUnchunkedLongMemories(
  driver: Driver,
  userId: string,
  minLength: number,
  limit: number,
): Promise<{ id: string; content: string }[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE size(m.content) > $minLength
         AND NOT (m)-[:HAS_CHUNK]->(:Chunk)
       RETURN m.id AS id, m.content AS content
       LIMIT $limit`,
      {
        userId,
        minLength: neo4j.int(minLength),
        limit: neo4j.int(limit),
      },
    );
    return result.records.map((r) => ({
      id: String(r.get("id")),
      content: String(r.get("content")),
    }));
  });
}
