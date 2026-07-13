"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  deleteAllMemoriesForUser,
  deleteMemory,
} from "../../../engine/neo4j/memory/crud";
import { getDriver } from "../../../engine/neo4j/driver";
import { scheduleContextPromptInvalidationByClerkId } from "../../lib/contextPromptInvalidate";

export async function runDeleteMemory(
  ctx: ActionCtx,
  args: { clerkId: string; memoryId: string },
): Promise<boolean> {
  const driver = getDriver();
  const deleted = await deleteMemory(driver, args.clerkId, args.memoryId);

  if (deleted) {
    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId: args.clerkId,
      eventType: "memory_deleted",
      memoryId: args.memoryId,
      payload: JSON.stringify({}),
    });
    await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
  }

  return deleted;
}

export async function runDeleteAllMemories(
  ctx: ActionCtx,
  args: { clerkId: string },
): Promise<number> {
  const driver = getDriver();
  const deleted = await deleteAllMemoriesForUser(driver, args.clerkId);
  if (deleted > 0) {
    await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
  }
  return deleted;
}
