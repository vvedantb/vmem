/**
 * Duplicate-merge + cleanup for memories. All four functions are idempotent
 * and re-runnable; they're exposed via `convex/neo4jActions/memories.ts` as
 * one-off action endpoints rather than running automatically on write.
 *
 * `deduplicateMemories` and `deduplicateBrowsingHistory` share the same
 * survivor-pick / edge-transfer / detach-delete shape — kept separate
 * because the duplicate-grouping rule differs (contentHash vs title within
 * browsing/bookmarks sources).
 */

import { type Driver } from "neo4j-driver";
import { toNeoInt } from "./mappers";
import { withSession } from "./shared";

export async function deduplicateMemories(
  driver: Driver,
  userId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    // Step 1: Find all duplicate groups. For each contentHash with >1 memory,
    // collect the IDs ordered by createdAt ASC (oldest = survivor).
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

    if (groups.records.length === 0) return 0;

    let totalDeleted = 0;

    for (const record of groups.records) {
      const survivorId = String(record.get("survivorId"));
      const duplicateIds = (record.get("duplicateIds") as string[]).map(String);
      const extraVisits = toNeoInt(record.get("extraVisits"));

      // Step 2: Transfer unique tags from duplicates → survivor
      await session.run(
        `MATCH (survivor:Memory {id: $survivorId})
         UNWIND $duplicateIds AS dupId
         MATCH (dup:Memory {id: dupId})-[:TAGGED_WITH]->(t:Tag)
         WHERE NOT (survivor)-[:TAGGED_WITH]->(t)
         MERGE (survivor)-[:TAGGED_WITH]->(t)`,
        { survivorId, duplicateIds },
      );

      // Step 3: Transfer unique RELATES_TO edges from duplicates → survivor
      // (both outgoing and incoming, excluding self-loops)
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

      // Step 4: Transfer MENTIONS edges from duplicates → survivor
      await session.run(
        `MATCH (survivor:Memory {id: $survivorId})
         UNWIND $duplicateIds AS dupId
         MATCH (dup:Memory {id: dupId})-[:MENTIONS]->(e:Entity)
         WHERE NOT (survivor)-[:MENTIONS]->(e)
         MERGE (survivor)-[:MENTIONS]->(e)`,
        { survivorId, duplicateIds },
      );

      // Step 5: Bump survivor's visitCount with the sum from duplicates
      if (extraVisits > 0) {
        await session.run(
          `MATCH (m:Memory {id: $survivorId})
           SET m.visitCount = coalesce(m.visitCount, 1) + $extraVisits`,
          { survivorId, extraVisits },
        );
      }

      // Step 6: Detach-delete all duplicates (removes all their edges too)
      await session.run(
        `UNWIND $duplicateIds AS dupId
         MATCH (m:Memory {id: dupId})
         DETACH DELETE m`,
        { duplicateIds },
      );

      totalDeleted += duplicateIds.length;
    }

    return totalDeleted;
  });
}

export async function deduplicateBrowsingHistory(
  driver: Driver,
  userId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    // Find all title groups with >1 browsing-history memory
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

    if (groups.records.length === 0) return 0;

    let totalDeleted = 0;

    for (const record of groups.records) {
      const survivorId = String(record.get("survivorId"));
      const duplicateIds = (record.get("duplicateIds") as string[]).map(String);
      const extraVisits = toNeoInt(record.get("extraVisits"));

      // Transfer unique tags
      await session.run(
        `MATCH (survivor:Memory {id: $survivorId})
         UNWIND $duplicateIds AS dupId
         MATCH (dup:Memory {id: dupId})-[:TAGGED_WITH]->(t:Tag)
         WHERE NOT (survivor)-[:TAGGED_WITH]->(t)
         MERGE (survivor)-[:TAGGED_WITH]->(t)`,
        { survivorId, duplicateIds },
      );

      // Transfer unique RELATES_TO outgoing
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

      // Transfer unique RELATES_TO incoming
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

      // Transfer MENTIONS edges
      await session.run(
        `MATCH (survivor:Memory {id: $survivorId})
         UNWIND $duplicateIds AS dupId
         MATCH (dup:Memory {id: dupId})-[:MENTIONS]->(e:Entity)
         WHERE NOT (survivor)-[:MENTIONS]->(e)
         MERGE (survivor)-[:MENTIONS]->(e)`,
        { survivorId, duplicateIds },
      );

      // Sum visitCounts
      if (extraVisits > 0) {
        await session.run(
          `MATCH (m:Memory {id: $survivorId})
           SET m.visitCount = coalesce(m.visitCount, 1) + $extraVisits`,
          { survivorId, extraVisits },
        );
      }

      // Delete duplicates
      await session.run(
        `UNWIND $duplicateIds AS dupId
         MATCH (m:Memory {id: dupId})
         DETACH DELETE m`,
        { duplicateIds },
      );

      totalDeleted += duplicateIds.length;
    }

    return totalDeleted;
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
    return toNeoInt(r.get("deleted"));
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
    return result.records.map((r) => ({
      id: String(r.get("id")),
      title: String(r.get("title")),
      contentPreview: String(r.get("contentPreview")),
      contentHash: r.get("contentHash") ? String(r.get("contentHash")) : null,
      createdAt: String(r.get("createdAt")),
    }));
  });
}
