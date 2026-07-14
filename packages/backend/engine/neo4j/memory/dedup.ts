import type { Driver, Record as NeoRecord, Session } from "neo4j-driver";
import { neo4jGet, neo4jString, parseNeo4jInt } from "../record";
import { withSession } from "./shared";

interface DuplicateGroup {
  survivorId: string;
  duplicateIds: string[];
  extraVisits: number;
}

function parseDuplicateGroup(record: NeoRecord): DuplicateGroup {
  const rawIds = neo4jGet(record, "duplicateIds");
  return {
    survivorId: neo4jString(record, "survivorId"),
    duplicateIds: Array.isArray(rawIds) ? rawIds.map(String) : [],
    extraVisits: parseNeo4jInt(neo4jGet(record, "extraVisits")),
  };
}

async function mergeDuplicateGroup(
  session: Session,
  group: DuplicateGroup,
): Promise<number> {
  const { survivorId, duplicateIds, extraVisits } = group;

  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (dup:Memory {id: dupId})-[:TAGGED_WITH]->(t:Tag)
     WHERE NOT (survivor)-[:TAGGED_WITH]->(t)
     MERGE (survivor)-[:TAGGED_WITH]->(t)`,
    { survivorId, duplicateIds },
  );

  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (dup:Memory {id: dupId})-[r:RELATES_TO]->(target)
     WHERE target.id <> $survivorId
       AND NOT (survivor)-[:RELATES_TO]->(target)
     MERGE (survivor)-[nr:RELATES_TO]->(target)
     ON CREATE SET nr.reason = r.reason, nr.score = r.score`,
    { survivorId, duplicateIds },
  );
  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (source)-[r:RELATES_TO]->(dup:Memory {id: dupId})
     WHERE source.id <> $survivorId
       AND NOT (source)-[:RELATES_TO]->(survivor)
     MERGE (source)-[nr:RELATES_TO]->(survivor)
     ON CREATE SET nr.reason = r.reason, nr.score = r.score`,
    { survivorId, duplicateIds },
  );

  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (dup:Memory {id: dupId})-[:MENTIONS]->(e:Entity)
     WHERE NOT (survivor)-[:MENTIONS]->(e)
     MERGE (survivor)-[:MENTIONS]->(e)`,
    { survivorId, duplicateIds },
  );

  if (extraVisits > 0) {
    await session.run(
      `MATCH (m:Memory {id: $survivorId})
       SET m.visitCount = coalesce(m.visitCount, 1) + $extraVisits`,
      { survivorId, extraVisits },
    );
  }

  await session.run(
    `UNWIND $duplicateIds AS dupId
     MATCH (m:Memory {id: dupId})
     DETACH DELETE m`,
    { duplicateIds },
  );

  return duplicateIds.length;
}

async function mergeAllGroups(
  session: Session,
  groups: NeoRecord[],
): Promise<number> {
  let totalDeleted = 0;
  for (const record of groups) {
    totalDeleted += await mergeDuplicateGroup(
      session,
      parseDuplicateGroup(record),
    );
  }
  return totalDeleted;
}

export async function deduplicateMemories(
  driver: Driver,
  userId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const groups = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.contentHash IS NOT NULL
       WITH m.contentHash AS hash, m ORDER BY m.createdAt ASC
       WITH hash, collect(m) AS sorted
       WHERE size(sorted) > 1
       RETURN hash,
              head(sorted).id AS survivorId,
              [m IN tail(sorted) | m.id] AS duplicateIds,
              reduce(total = 0, m IN tail(sorted) | total + coalesce(m.visitCount, 1)) AS extraVisits`,
      { userId },
    );
    return mergeAllGroups(session, groups.records);
  });
}

export async function deduplicateBrowsingHistory(
  driver: Driver,
  userId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const groups = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.source IN ['browsing-history', 'bookmarks']
       WITH m.title AS title, m ORDER BY m.createdAt ASC
       WITH title, collect(m) AS sorted
       WHERE size(sorted) > 1
       RETURN title,
              head(sorted).id AS survivorId,
              [m IN tail(sorted) | m.id] AS duplicateIds,
              reduce(total = 0, m IN tail(sorted) | total + coalesce(m.visitCount, 1)) AS extraVisits`,
      { userId },
    );
    return mergeAllGroups(session, groups.records);
  });
}

export async function diagnoseDuplicates(
  driver: Driver,
  userId: string,
  title: string,
): Promise<
  Array<{
    id: string;
    title: string;
    contentPreview: string;
    contentHash: string | null;
    createdAt: string;
  }>
> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE toLower(m.title) = toLower($title)
       RETURN m.id AS id,
              m.title AS title,
              left(m.content, 100) AS contentPreview,
              m.contentHash AS contentHash,
              m.createdAt AS createdAt
       ORDER BY m.createdAt ASC`,
      { userId, title },
    );
    return result.records.map((r) => {
      const rawHash = neo4jGet(r, "contentHash");
      return {
        id: String(neo4jGet(r, "id")),
        title: String(neo4jGet(r, "title")),
        contentPreview: String(neo4jGet(r, "contentPreview")),
        contentHash: typeof rawHash === "string" ? rawHash : null,
        createdAt: String(neo4jGet(r, "createdAt")),
      };
    });
  });
}
