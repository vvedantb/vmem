"use node";

/**
 * Memory delete handlers: single-memory delete (with audit event) and
 * the wipe-all action used by the settings → Data Controls page.
 */

import { type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  deleteAllMemoriesForUser,
  deleteMemory,
} from "../../../engine/neo4j/memory/crud";
import { getDriver } from "../../../engine/neo4j/driver";
import { scheduleContextPromptInvalidation } from "./shared";

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
    await scheduleContextPromptInvalidation(ctx, args.clerkId);
  }

  return deleted;
}

/**
 * Wipe every memory the user owns plus all per-user dependents (chunks,
 * events, proposed updates, entities, orphan tags/sources). Used by the
 * settings → Data Controls "delete all memories" action. Skips per-memory
 * audit events since the source rows are gone — the action that calls
 * this is itself audit-logged at the API layer.
 */
export async function runDeleteAllMemories(
  ctx: ActionCtx,
  args: { clerkId: string },
): Promise<number> {
  const driver = getDriver();
  const deleted = await deleteAllMemoriesForUser(driver, args.clerkId);
  if (deleted > 0) {
    await scheduleContextPromptInvalidation(ctx, args.clerkId);
  }
  return deleted;
}
