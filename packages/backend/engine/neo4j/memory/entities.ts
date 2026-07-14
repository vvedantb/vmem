import type { Driver, Record as Neo4jRecord } from "neo4j-driver";
import { neo4jGet, neo4jString, parseNeo4jInt } from "../record";
import { withSession } from "./shared";

export interface EntityUsage {
  name: string;
  type: string;
  mentions: number;
}

function entityUsageFromRecord(r: Neo4jRecord): EntityUsage {
  return {
    name: neo4jString(r, "name"),
    type: neo4jString(r, "type"),
    mentions: parseNeo4jInt(neo4jGet(r, "mentions")),
  };
}

export async function getTopEntities(
  driver: Driver,
  userId: string,
  limit: number = 150,
): Promise<EntityUsage[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (e:Entity {userId: $userId})<-[:MENTIONS]-(m:Memory)
       WITH e, count(m) AS mentions
       WHERE mentions >= 2
       RETURN e.name AS name, e.type AS type, mentions
       ORDER BY mentions DESC, name ASC
       LIMIT toInteger($limit)`,
      { userId, limit: Math.trunc(limit) },
    );
    return result.records.map(entityUsageFromRecord);
  });
}

export async function listEntitiesWithMentions(
  driver: Driver,
  userId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    normalizedName: string;
    type: string;
    mentions: number;
  }>
> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (e:Entity {userId: $userId})
       OPTIONAL MATCH (e)<-[:MENTIONS]-(m:Memory)
       RETURN e.id AS id, e.name AS name, e.normalizedName AS normalizedName,
              e.type AS type, count(m) AS mentions`,
      { userId },
    );
    return result.records.map((r) => ({
      id: neo4jString(r, "id"),
      normalizedName: neo4jString(r, "normalizedName"),
      ...entityUsageFromRecord(r),
    }));
  });
}

export async function mergeEntityGroup(
  driver: Driver,
  params: {
    survivorId: string;
    duplicateIds: string[];
    displayName: string;
    normalizedName: string;
  },
): Promise<void> {
  if (params.duplicateIds.length === 0) return;
  await withSession(driver, async (session) => {
    await session.run(
      `MATCH (survivor:Entity {id: $survivorId})
       SET survivor.name = $displayName, survivor.normalizedName = $normalizedName
       WITH survivor
       UNWIND $duplicateIds AS dupId
       MATCH (dup:Entity {id: dupId})
       OPTIONAL MATCH (dup)<-[r:MENTIONS]-(m:Memory)
       FOREACH (_ IN CASE WHEN m IS NULL THEN [] ELSE [1] END |
         MERGE (m)-[:MENTIONS]->(survivor)
       )
       DELETE r
       WITH DISTINCT dup
       DETACH DELETE dup`,
      params,
    );
  });
}
