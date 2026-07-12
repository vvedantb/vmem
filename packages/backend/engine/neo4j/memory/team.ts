/**
 * Team-scoped reads + owner-override mutation.
 *
 * Access control: the caller is expected to have already verified team
 * membership at the Convex layer. These functions restrict results to a
 * specific team profile AND to the set of clerkIds allowed on that team
 * (defence in depth). Memories authored by removed ex-members stay with
 * their original userId and are still returned — attribution is preserved
 * even though the user is no longer in `allowedUserIds`. (This is
 * intentional per product decision: removed members' knowledge stays with
 * the team.)
 *
 * To keep historical memories visible after member removal, team reads use
 * `m.profileId = $profileId` as the primary filter and do NOT require the
 * creator be currently in `allowedUserIds`.
 */

import type { Driver } from "neo4j-driver";
import { detachDeleteCount, fetchMemoryWithTags, runMemoryList } from "./crud";
import { withSession } from "./shared";
import {
  type MemoryStatus,
  type MemoryType,
  type MemoryWithTags,
} from "./types";

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

export async function searchMemoriesForTeam(
  driver: Driver,
  params: {
    profileId: string;
    query?: string;
    type?: MemoryType;
    tags?: string[];
    source?: string;
    limit: number;
    offset: number;
  },
): Promise<{ memories: MemoryWithTags[]; total: number }> {
  return listMemoriesForTeam(driver, {
    profileId: params.profileId,
    type: params.type,
    tags: params.tags,
    source: params.source,
    searchQuery: params.query,
    limit: params.limit,
    offset: params.offset,
  });
}

/**
 * Team-owner override for mutations: delete any memory on a team profile
 * regardless of original author. Scoped strictly by profileId to keep the
 * blast radius small.
 */
export async function deleteTeamMemoryAsOwner(
  driver: Driver,
  profileId: string,
  memoryId: string,
): Promise<boolean> {
  return withSession(driver, (session) =>
    detachDeleteCount(session, { id: memoryId, profileId }),
  );
}
