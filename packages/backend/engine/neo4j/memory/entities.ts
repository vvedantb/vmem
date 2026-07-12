/**
 * Entity vocabulary queries + group merge (Node-only — Neo4j driver).
 *
 * Entities suffer the same divergence problem tags did: the extractor never
 * saw the user's existing entities, so the same real-world thing accumulated
 * name variants ("Fable", "Fable 5", "Claude Fable 5", "Claude Fable-5" —
 * five nodes for one model). getTopEntities feeds the established names back
 * into the enrichment prompt; mergeEntityGroup collapses variant nodes.
 */
import type { Driver, Record as Neo4jRecord } from "neo4j-driver";
import { neo4jGet, parseNeo4jInt } from "../record";
import { withSession } from "./shared";

export interface EntityUsage {
  name: string;
  type: string;
  mentions: number;
}

/** Shared `{name, type, mentions}` projection used by both entity-listing queries below. */
function entityUsageFromRecord(r: Neo4jRecord): EntityUsage {
  return {
    name: String(neo4jGet(r, "name") ?? ""),
    type: String(neo4jGet(r, "type") ?? ""),
    mentions: parseNeo4jInt(neo4jGet(r, "mentions")),
  };
}

/**
 * The user's most-mentioned entities. Fed into the enrichment prompt so a
 * mention of an already-known entity reuses its established name exactly
 * instead of minting a variant.
 */
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

/** All of a user's entities with ids — input for alias-merge candidate
 *  detection. */
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
      id: String(neo4jGet(r, "id") ?? ""),
      normalizedName: String(neo4jGet(r, "normalizedName") ?? ""),
      ...entityUsageFromRecord(r),
    }));
  });
}

/**
 * Collapse a group of Entity nodes onto a survivor: MENTIONS edges re-point
 * (MERGE — no duplicate edges), duplicates are deleted, the survivor takes
 * the given display name and normalizedName.
 */
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
