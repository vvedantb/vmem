import type { Driver } from "neo4j-driver";
import { firstNeo4jInt } from "../record";

// move memories from one profile to another
export async function moveMemoriesBetweenProfiles(
  driver: Driver,
  userId: string,
  fromProfileId: string,
  toProfileId: string,
): Promise<number> {
  const result = await driver.executeQuery(
    `MATCH (m:Memory {userId: $userId, profileId: $fromProfileId})
     SET m.profileId = $toProfileId
     RETURN count(m) AS moved`,
    { userId, fromProfileId, toProfileId },
  );
  return firstNeo4jInt(result, "moved");
}

// delete all memories for a profile
export async function deleteMemoriesByProfile(
  driver: Driver,
  userId: string,
  profileId: string,
): Promise<number> {
  const result = await driver.executeQuery(
    `MATCH (m:Memory {userId: $userId, profileId: $profileId})
     DETACH DELETE m
     RETURN count(m) AS deleted`,
    { userId, profileId },
  );
  return firstNeo4jInt(result, "deleted");
}

export async function setEmbeddings(
  driver: Driver,
  rows: Array<{ id: string; embedding: number[] }>,
): Promise<void> {
  if (rows.length === 0) return;
  await driver.executeQuery(
    `UNWIND $rows AS r
     MATCH (m:Memory {id: r.id})
     SET m.embedding = r.embedding`,
    { rows },
  );
}
