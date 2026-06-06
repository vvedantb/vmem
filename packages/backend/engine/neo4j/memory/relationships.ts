/**
 * Memory↔Memory `RELATES_TO` edge management. `linkMemories` and
 * `unlinkMemories` are user-driven (via the relationships API);
 * `getRelatedMemories` and `getAllRelationships` are read-only and feed
 * the detail panel + graph view respectively.
 *
 * Semantic-similarity edge auto-creation lives elsewhere
 * (`migration.createSemanticEdgesForMemory`, `connectors.upsertFromSource`).
 */

import neo4j, { type Driver } from "neo4j-driver";
import { toMemoryWithTags } from "./mappers";
import { withSession } from "./shared";
import { type MemoryWithTags } from "./types";

export async function linkMemories(
  driver: Driver,
  userId: string,
  memoryIdA: string,
  memoryIdB: string,
  reason: string,
): Promise<boolean> {
  if (memoryIdA === memoryIdB) return false;
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (a:Memory {id: $memoryIdA, userId: $userId}), (b:Memory {id: $memoryIdB, userId: $userId})
       MERGE (a)-[r:RELATES_TO]->(b)
       SET r.reason = $reason
       RETURN a, b`,
      { memoryIdA, memoryIdB, userId, reason },
    );
    return result.records.length > 0;
  });
}

export async function unlinkMemories(
  driver: Driver,
  userId: string,
  memoryIdA: string,
  memoryIdB: string,
): Promise<boolean> {
  return withSession(driver, async (session) => {
    await session.run(
      `MATCH (a:Memory {id: $memoryIdA, userId: $userId})-[r:RELATES_TO]-(b:Memory {id: $memoryIdB, userId: $userId})
       DELETE r`,
      { memoryIdA, memoryIdB, userId },
    );
    return true;
  });
}

export async function getRelatedMemories(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<{ memory: MemoryWithTags; reason: string }[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})-[r:RELATES_TO]-(related:Memory)
       OPTIONAL MATCH (related)-[:TAGGED_WITH]->(t:Tag)
       RETURN related AS m, collect(DISTINCT t.name) AS tags, r.reason AS reason`,
      { memoryId, userId },
    );
    return result.records.map((record) => ({
      memory: toMemoryWithTags(record),
      reason: String(record.get("reason") ?? ""),
    }));
  });
}

export async function getAllRelationships(
  driver: Driver,
  userId: string,
  limit = 500,
): Promise<{ source: string; target: string; reason: string }[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (a:Memory {userId: $userId})-[r:RELATES_TO]->(b:Memory)
       RETURN a.id AS source, b.id AS target, r.reason AS reason
       LIMIT $limit`,
      { userId, limit: neo4j.int(limit) },
    );

    return result.records.map((record) => ({
      source: String(record.get("source") ?? ""),
      target: String(record.get("target") ?? ""),
      reason: String(record.get("reason") ?? ""),
    }));
  });
}
