import type { Driver } from "neo4j-driver";
import { detachDeleteCount, fetchMemoryWithTags, runMemoryList } from "./crud";
import { withSession } from "../session";
import type { MemoryStatus, MemoryType, MemoryWithTags } from "./types";

export async function listMemoriesForTeam(
  driver: Driver,
  params: {
    profileId: string;
    type?: MemoryType;
    status?: MemoryStatus;
    source?: string;
    tags?: string[];
    searchQuery?: string;
    limit: number;
    offset: number;
  },
): Promise<{ memories: MemoryWithTags[]; total: number }> {
  return withSession(driver, (session) =>
    runMemoryList(
      session,
      "m.profileId = $profileId",
      { profileId: params.profileId },
      params,
    ),
  );
}

export async function getMemoryForTeam(
  driver: Driver,
  profileId: string,
  memoryId: string,
): Promise<MemoryWithTags | null> {
  return fetchMemoryWithTags(driver, { id: memoryId, profileId });
}

export async function deleteTeamMemoryAsOwner(
  driver: Driver,
  profileId: string,
  memoryId: string,
): Promise<boolean> {
  return withSession(driver, (session) =>
    detachDeleteCount(session, { id: memoryId, profileId }),
  );
}
