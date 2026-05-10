"use node";

/**
 * Team-scoped memory handlers. The Convex layer must verify team
 * membership BEFORE invoking these — they carry no per-user auth check,
 * only a profileId filter.
 */

import { type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  deleteTeamMemoryAsOwner,
  getMemoryForTeam,
  listMemoriesForTeam,
  searchMemoriesForTeam,
} from "../../../src/neo4j/memoryService";
import { getDriver } from "../../../src/neo4j/driver";
import { toMemoryStatus, toMemoryType } from "./shared";

export interface ListMemoriesForTeamArgs {
  profileId: string;
  type?: string;
  status?: string;
  tags?: string[];
  limit: number;
  offset: number;
}

export async function runListMemoriesForTeam(args: ListMemoriesForTeamArgs) {
  const driver = getDriver();
  return await listMemoriesForTeam(driver, {
    profileId: args.profileId,
    type: toMemoryType(args.type),
    status: toMemoryStatus(args.status),
    tags: args.tags,
    limit: args.limit,
    offset: args.offset,
  });
}

export async function runGetMemoryForTeam(args: {
  profileId: string;
  memoryId: string;
}) {
  const driver = getDriver();
  return await getMemoryForTeam(driver, args.profileId, args.memoryId);
}

export interface SearchMemoriesForTeamArgs {
  profileId: string;
  query?: string;
  type?: string;
  tags?: string[];
  source?: string;
  limit: number;
  offset: number;
}

export async function runSearchMemoriesForTeam(
  args: SearchMemoriesForTeamArgs,
) {
  const driver = getDriver();
  return await searchMemoriesForTeam(driver, {
    profileId: args.profileId,
    query: args.query,
    type: toMemoryType(args.type),
    tags: args.tags,
    source: args.source,
    limit: args.limit,
    offset: args.offset,
  });
}

export async function runDeleteTeamMemoryAsOwner(
  ctx: ActionCtx,
  args: { profileId: string; memoryId: string; ownerClerkId: string },
): Promise<boolean> {
  const driver = getDriver();
  const deleted = await deleteTeamMemoryAsOwner(
    driver,
    args.profileId,
    args.memoryId,
  );

  if (deleted) {
    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId: args.ownerClerkId,
      eventType: "memory_deleted",
      memoryId: args.memoryId,
      payload: JSON.stringify({ moderatedByTeamOwner: true }),
    });
  }

  return deleted;
}
