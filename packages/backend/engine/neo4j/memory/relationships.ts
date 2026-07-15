import neo4j, {
  type Driver,
  type Record as NeoRecord,
  type Session,
} from "neo4j-driver";
import { neo4jGet, parseNeo4jInt } from "../record";
import { toMemoryWithTags } from "./mappers";
import { withSession } from "../session";
import type { MemoryWithTags } from "./types";

const SEMANTIC_EDGE_K = 20;
const SEMANTIC_EDGE_THRESHOLD = 0.78;
const SEMANTIC_EDGE_LIMIT = 5;

function stringField(record: NeoRecord, key: string): string {
  const value = neo4jGet(record, key);
  return typeof value === "string" ? value : "";
}

export async function createSemanticSimilarityEdges(
  session: Session,
  memoryId: string,
  userId: string,
  embedding: number[],
): Promise<number> {
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
      k: neo4j.int(SEMANTIC_EDGE_K),
      embedding,
      userId,
      id: memoryId,
      threshold: SEMANTIC_EDGE_THRESHOLD,
      limit: neo4j.int(SEMANTIC_EDGE_LIMIT),
    },
  );
  const record = result.records[0];
  return record ? parseNeo4jInt(neo4jGet(record, "created")) : 0;
}

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
      reason: stringField(record, "reason"),
    }));
  });
}
