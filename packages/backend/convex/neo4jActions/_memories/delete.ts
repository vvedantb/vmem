"use node";

import type { ActionCtx } from "../../_generated/server";
import {
  deleteAllMemoriesForUser,
  deleteMemory,
} from "../../../engine/neo4j/memory/crud";
import { getDriver } from "../../../engine/neo4j/driver";
import { scheduleAfterMemoryMutation } from "./lifecycle";
import { dualWriteDelete, dualWriteDeleteAllForUser } from "./dualWrite";

export async function runDeleteMemory(
  ctx: ActionCtx,
  args: { clerkId: string; memoryId: string },
): Promise<boolean> {
  const driver = getDriver();
  const deleted = await deleteMemory(driver, args.clerkId, args.memoryId);

  if (deleted) {
    await dualWriteDelete(ctx, args.clerkId, args.memoryId);
    await scheduleAfterMemoryMutation(ctx, {
      clerkId: args.clerkId,
      event: {
        type: "memory_deleted",
        memoryId: args.memoryId,
        payload: JSON.stringify({}),
      },
    });
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
    await dualWriteDeleteAllForUser(ctx, args.clerkId);
    await scheduleAfterMemoryMutation(ctx, { clerkId: args.clerkId });
  }
  return deleted;
}
