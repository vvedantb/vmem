"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  deleteTeamMemoryAsOwner,
  getMemoryForTeam,
  listMemoriesForTeam,
} from "../../../engine/neo4j/memory/team";
import { getDriver } from "../../../engine/neo4j/driver";
import type {
  TeamListMemoriesArgs,
  TeamSearchMemoriesArgs,
} from "../../memoryApi/validators";
import { toMemoryStatus, toMemoryType } from "./shared";

export async function runListMemoriesForTeam(args: TeamListMemoriesArgs) {
  const driver = getDriver();
  return await listMemoriesForTeam(driver, {
    profileId: args.profileId,
    type: toMemoryType(args.type),
    status: toMemoryStatus(args.status),
    source: args.source,
    tags: args.tags,
    searchQuery: args.searchQuery,
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

export async function runSearchMemoriesForTeam(args: TeamSearchMemoriesArgs) {
  return runListMemoriesForTeam({
    profileId: args.profileId,
    type: args.type,
    tags: args.tags,
    source: args.source,
    searchQuery: args.query,
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
