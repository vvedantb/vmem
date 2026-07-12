/**
 * Duplicate-merge + cleanup for memories. All four functions are idempotent
 * and re-runnable; they're exposed via `convex/neo4jActions/memories.ts` as
 * one-off action endpoints rather than running automatically on write.
 *
 * `deduplicateMemories` and `deduplicateBrowsingHistory` differ ONLY in how
 * they group duplicates (contentHash vs title within browsing/bookmarks
 * sources). Both then run the identical survivor-merge body, which lives in
 * `mergeDuplicateGroup` so the two paths cannot drift.
 */

import {
  type Driver,
  type Record as NeoRecord,
  type Session,
} from "neo4j-driver";
import { neo4jGet, neo4jString, parseNeo4jInt } from "../record";
import { withSession } from "./shared";

interface DuplicateGroup {
  /** Oldest memory in the group — everything folds into this one. */
  survivorId: string;
  /** The other members, to be merged away and detach-deleted. */
  duplicateIds: string[];
  /** Sum of the duplicates' visit counts, added onto the survivor. */
  extraVisits: number;
}

/**
 * Parse a grouping-query record into a DuplicateGroup. Both grouping queries
 * project the same `survivorId` / `duplicateIds` / `extraVisits` columns.
 */
function parseDuplicateGroup(record: NeoRecord): DuplicateGroup {
  const rawIds = neo4jGet(record, "duplicateIds");
  return {
    survivorId: neo4jString(record, "survivorId"),
    duplicateIds: Array.isArray(rawIds) ? rawIds.map(String) : [],
    extraVisits: parseNeo4jInt(neo4jGet(record, "extraVisits")),
  };
}

/**
 * Merge one duplicate group into its survivor and return how many duplicates
 * were removed. Transfers unique tags, RELATES_TO edges (both directions), and
 * MENTIONS edges onto the survivor; folds the duplicates' visit counts in;
 * then detach-deletes the duplicates (which drops their remaining edges too).
 * Shared verbatim by both dedup paths.
 */
async function mergeDuplicateGroup(
  session: Session,
  group: DuplicateGroup,
): Promise<number> {
  const { survivorId, duplicateIds, extraVisits } = group;

  // Transfer unique tags from duplicates → survivor.
  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (dup:Memory {id: dupId})-[:TAGGED_WITH]->(t:Tag)
     WHERE NOT (survivor)-[:TAGGED_WITH]->(t)
     MERGE (survivor)-[:TAGGED_WITH]->(t)`,
    { survivorId, duplicateIds },
  );

  // Transfer unique RELATES_TO edges (outgoing then incoming, no self-loops).
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

  // Transfer MENTIONS edges from duplicates → survivor.
  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (dup:Memory {id: dupId})-[:MENTIONS]->(e:Entity)
     WHERE NOT (survivor)-[:MENTIONS]->(e)
     MERGE (survivor)-[:MENTIONS]->(e)`,
    { survivorId, duplicateIds },
  );

  // Fold the duplicates' visit counts into the survivor.
  if (extraVisits > 0) {
    await session.run(
      `MATCH (m:Memory {id: $survivorId})
       SET m.visitCount = coalesce(m.visitCount, 1) + $extraVisits`,
      { survivorId, extraVisits },
    );
  }

  // Detach-delete the duplicates (removes all their remaining edges too).
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
    // Group by contentHash: any hash shared by >1 memory is a duplicate set,
    // ordered createdAt ASC so the oldest becomes the survivor.
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
    // Group browsing-history/bookmarks memories by title — catches the "every
    // page on my app has the same <title>" case that contentHash misses.
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

/**
 * Delete all "same session" RELATES_TO edges from batch import sources.
 * One-time cleanup migration for existing junk edges.
 */
export async function deleteJunkSessionEdges(
  driver: Driver,
  userId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})-[r:RELATES_TO {reason: 'same session'}]->(m2:Memory)
       WHERE m.source IN ['browsing-history', 'bookmarks', 'google_drive', 'notion', 'onedrive', 'linear', 'gmail']
       DELETE r
       RETURN count(r) AS deleted`,
      { userId },
    );
    const r = result.records[0];
    if (!r) return 0;
    return parseNeo4jInt(neo4jGet(r, "deleted"));
  });
}

/**
 * Diagnostic: find all memories matching a title (case-insensitive) and
 * return their id, title, content (first 100 chars), and contentHash so
 * we can see why hash-based dedup did or didn't group them.
 */
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
