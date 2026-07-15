import neo4j, {
  type Driver,
  type Record as Neo4jRecord,
  type Session,
  type Transaction,
} from "neo4j-driver";
import { neo4jGet, neo4jString, parseNeo4jInt } from "../record";
import { withSession } from "../session";
import { normalizeTags } from "./tagNormalize";
import type { TagUsage } from "./tagNormalize";
import { visibleStatusClause } from "./shared";

type EntityInput = Array<{
  name: string;
  normalizedName: string;
  type: string;
}>;

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

export async function getTopTags(
  driver: Driver,
  userId: string,
  limit: number = 50,
): Promise<TagUsage[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (t:Tag)<-[:TAGGED_WITH]-(m:Memory {userId: $userId})
       WITH t.name AS name, count(m) AS uses
       WHERE uses >= 2
       RETURN name, uses
       ORDER BY uses DESC, name ASC
       LIMIT toInteger($limit)`,
      { userId, limit: Math.trunc(limit) },
    );
    return result.records.map((r) => ({
      name: neo4jString(r, "name"),
      uses: parseNeo4jInt(neo4jGet(r, "uses")),
    }));
  });
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

export async function getRecentMemoryTitles(
  driver: Driver,
  userId: string,
  excludeId: string,
  limit = 30,
): Promise<Array<{ id: string; title: string }>> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.id <> $excludeId AND ${visibleStatusClause("m", false)}
       RETURN m.id AS id, m.title AS title
       ORDER BY m.updatedAt DESC
       LIMIT $limit`,
      { userId, excludeId, limit: neo4j.int(limit) },
    );
    return result.records.map((r) => ({
      id: String(r.get("id")),
      title: String(r.get("title")),
    }));
  });
}

async function replaceMentionsEdges(
  runner: Session | Transaction,
  memoryId: string,
  userId: string,
  entities: EntityInput,
): Promise<void> {
  await runner.run(
    `MATCH (m:Memory {id: $memoryId, userId: $userId})
     OPTIONAL MATCH (m)-[r:MENTIONS]->(:Entity)
     DELETE r
     WITH m
     FOREACH (ent IN $entities |
       MERGE (e:Entity {userId: $userId, normalizedName: ent.normalizedName})
       ON CREATE SET e.name = ent.name, e.type = ent.type, e.id = randomUUID(), e.createdAt = datetime()
       MERGE (m)-[:MENTIONS]->(e)
     )`,
    { memoryId, userId, entities },
  );
}

export async function applyEnrichment(
  driver: Driver,
  memoryId: string,
  userId: string,
  tags: string[],
  relatedIds: string[],
  entities: EntityInput = [],
): Promise<void> {
  return withSession(driver, async (session) => {
    const tx = session.beginTransaction();
    try {
      await tx.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         OPTIONAL MATCH (m)-[r:TAGGED_WITH]->(:Tag)
         DELETE r
         WITH m
         FOREACH (tagName IN $tags |
           MERGE (t:Tag {name: tagName})
           MERGE (m)-[:TAGGED_WITH]->(t)
         )`,
        { memoryId, userId, tags: normalizeTags(tags) },
      );

      await tx.run(
        `MATCH (m:Memory {id: $memoryId, userId: $userId})
         OPTIONAL MATCH (m)-[r:RELATES_TO]-()
         WHERE r.reason = 'content similarity'
         DELETE r`,
        { memoryId, userId },
      );

      if (relatedIds.length > 0) {
        await tx.run(
          `MATCH (m:Memory {id: $memoryId, userId: $userId})
           UNWIND $relatedIds AS relId
           MATCH (m2:Memory {id: relId, userId: $userId})
           MERGE (m)-[r:RELATES_TO]->(m2)
           ON CREATE SET r.reason = 'content similarity'`,
          { memoryId, userId, relatedIds },
        );
      }

      if (entities.length > 0) {
        await replaceMentionsEdges(tx, memoryId, userId, entities);
      }

      await tx.commit();
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  });
}
