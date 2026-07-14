import type { Driver, Session, Transaction } from "neo4j-driver";
import { withSession } from "./shared";
import { normalizeTags } from "./tagNormalize";

type EntityInput = Array<{
  name: string;
  normalizedName: string;
  type: string;
}>;

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

export async function applyEntitiesOnly(
  driver: Driver,
  memoryId: string,
  userId: string,
  entities: EntityInput,
): Promise<void> {
  if (entities.length === 0) return;
  return withSession(driver, (session) =>
    replaceMentionsEdges(session, memoryId, userId, entities),
  );
}
