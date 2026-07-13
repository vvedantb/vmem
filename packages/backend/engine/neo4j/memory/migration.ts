/**
 * Profile memory move/delete helpers used by profile and team lifecycle,
 * plus setEmbeddings used by post-create materialize and neo4j-cli seed.
 */

import type { Driver, QueryResult } from "neo4j-driver";
import { neo4jGet, parseNeo4jInt } from "../record";
import { withSession } from "./shared";

function firstCount(result: QueryResult, key: string): number {
  const record = result.records[0];
  return record ? parseNeo4jInt(neo4jGet(record, key)) : 0;
}

/** Move memories from one profile to another. */
export async function moveMemoriesBetweenProfiles(
  driver: Driver,
  userId: string,
  fromProfileId: string,
  toProfileId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, profileId: $fromProfileId})
       SET m.profileId = $toProfileId
       RETURN count(m) AS moved`,
      { userId, fromProfileId, toProfileId },
    );
    return firstCount(result, "moved");
  });
}

/** Delete all memories for a profile. */
export async function deleteMemoriesByProfile(
  driver: Driver,
  userId: string,
  profileId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, profileId: $profileId})
       DETACH DELETE m
       RETURN count(m) AS deleted`,
      { userId, profileId },
    );
    return firstCount(result, "deleted");
  });
}

/**
 * Bulk-set embeddings on existing memories by id. One round trip via
 * UNWIND to avoid N queries per batch.
 */
export async function setEmbeddings(
  driver: Driver,
  rows: Array<{ id: string; embedding: number[] }>,
): Promise<void> {
  if (rows.length === 0) return;
  await withSession(driver, async (session) => {
    await session.run(
      `UNWIND $rows AS r
       MATCH (m:Memory {id: r.id})
       SET m.embedding = r.embedding`,
      { rows },
    );
  });
}
