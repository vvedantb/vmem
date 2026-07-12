/**
 * Timeline reads — derive a chronologically-ordered event list scoped by
 * memory, tag, or fulltext query. Three callers in
 * `convex/neo4jActions/memories.ts` (one per scope).
 */

import neo4j, { type Driver } from "neo4j-driver";
import { toMemoryContentFulltextQuery } from "../luceneQuery";
import { toTimelineEvent } from "./mappers";
import { withSession } from "./shared";
import { type ConnectionType, type TimelineEvent } from "./types";

/**
 * Run a Cypher query and map every record with `toTimelineEvent`. Shared by
 * the two timeline reads whose result shape needs no per-row extras
 * (`getTopicTimeline` also tags each row with a `connectionType`, so it
 * stays out of this helper).
 */
async function runTimelineQuery(
  driver: Driver,
  cypher: string,
  params: Record<string, unknown>,
): Promise<TimelineEvent[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(cypher, params);
    return result.records.map(toTimelineEvent);
  });
}

export async function getMemoryTimeline(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<TimelineEvent[]> {
  return runTimelineQuery(
    driver,
    `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {id: $memoryId, userId: $userId})
     RETURN e, m.id AS memoryId, m.title AS memoryTitle
     ORDER BY e.createdAt ASC`,
    { memoryId, userId },
  );
}

export async function getTopicTimeline(
  driver: Driver,
  userId: string,
  tag: string,
  limit: number,
  offset: number,
): Promise<TimelineEvent[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (tagMatched:Memory {userId: $userId})-[:TAGGED_WITH]->(t:Tag {name: $tag})
       WITH collect(DISTINCT tagMatched) AS tagMemories
       UNWIND tagMemories AS tm
       OPTIONAL MATCH (tm)-[:RELATES_TO]-(related:Memory {userId: $userId})
       WITH tagMemories, collect(DISTINCT related) AS relatedMemories
       WITH tagMemories, [r IN relatedMemories WHERE r IS NOT NULL AND NOT r IN tagMemories] AS onlyRelated
       WITH tagMemories + onlyRelated AS allMemories, tagMemories
       UNWIND allMemories AS mem
       WITH DISTINCT mem, mem IN tagMemories AS isTagMatch
       MATCH (e:MemoryEvent)-[:EVENT_FOR]->(mem)
       RETURN e, mem.id AS memoryId, mem.title AS memoryTitle,
              CASE WHEN isTagMatch THEN 'tag' ELSE 'related' END AS connectionType
       ORDER BY e.createdAt ASC
       SKIP $offset LIMIT $limit`,
      {
        userId,
        tag,
        offset: neo4j.int(offset),
        limit: neo4j.int(limit),
      },
    );

    return result.records.map((record) => {
      const connType = String(record.get("connectionType") ?? "");
      const connectionType: ConnectionType =
        connType === "related" ? "related" : "tag";
      return { ...toTimelineEvent(record), connectionType };
    });
  });
}

export async function getSearchTimeline(
  driver: Driver,
  userId: string,
  query: string,
  limit: number,
  offset: number,
): Promise<TimelineEvent[]> {
  const luceneQuery = toMemoryContentFulltextQuery(query);
  if (luceneQuery === null) {
    return [];
  }

  return runTimelineQuery(
    driver,
    `CALL db.index.fulltext.queryNodes('memory_content', $query)
     YIELD node AS m, score
     WHERE m.userId = $userId
     MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m)
     RETURN e, m.id AS memoryId, m.title AS memoryTitle
     ORDER BY e.createdAt ASC
     SKIP $offset LIMIT $limit`,
    {
      query: luceneQuery,
      userId,
      offset: neo4j.int(offset),
      limit: neo4j.int(limit),
    },
  );
}
