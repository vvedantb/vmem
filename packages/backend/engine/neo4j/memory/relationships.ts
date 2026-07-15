import neo4j, { type Driver, type Session } from "neo4j-driver";
import { firstNeo4jInt, neo4jString } from "../record";
import { toMemoryWithTags } from "./mappers";
import type { MemoryWithTags } from "./types";

const SEMANTIC_EDGE_K = 20;
const SEMANTIC_EDGE_THRESHOLD = 0.78;
const SEMANTIC_EDGE_LIMIT = 5;

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
  return firstNeo4jInt(result, "created");
}

export async function linkMemories(
  driver: Driver,
  userId: string,
  memoryIdA: string,
  memoryIdB: string,
  reason: string,
): Promise<boolean> {
  if (memoryIdA === memoryIdB) return false;
  const result = await driver.executeQuery(
    `MATCH (a:Memory {id: $memoryIdA, userId: $userId}), (b:Memory {id: $memoryIdB, userId: $userId})
     MERGE (a)-[r:RELATES_TO]->(b)
     SET r.reason = $reason
     RETURN a, b`,
    { memoryIdA, memoryIdB, userId, reason },
  );
  return result.records.length > 0;
}

export async function unlinkMemories(
  driver: Driver,
  userId: string,
  memoryIdA: string,
  memoryIdB: string,
): Promise<boolean> {
  await driver.executeQuery(
    `MATCH (a:Memory {id: $memoryIdA, userId: $userId})-[r:RELATES_TO]-(b:Memory {id: $memoryIdB, userId: $userId})
     DELETE r`,
    { memoryIdA, memoryIdB, userId },
  );
  // characterization: always true even when no relationship existed
  return true;
}

export async function getRelatedMemories(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<{ memory: MemoryWithTags; reason: string }[]> {
  const result = await driver.executeQuery(
    `MATCH (m:Memory {id: $memoryId, userId: $userId})-[r:RELATES_TO]-(related:Memory)
     OPTIONAL MATCH (related)-[:TAGGED_WITH]->(t:Tag)
     RETURN related AS m, collect(DISTINCT t.name) AS tags, r.reason AS reason`,
    { memoryId, userId },
  );
  return result.records.map((record) => ({
    memory: toMemoryWithTags(record),
    reason: neo4jString(record, "reason"),
  }));
}
