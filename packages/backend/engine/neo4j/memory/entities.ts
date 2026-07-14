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
