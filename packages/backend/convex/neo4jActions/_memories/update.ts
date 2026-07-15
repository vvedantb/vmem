"use node";

import type { ActionCtx } from "../../_generated/server";
import { updateMemory } from "../../../engine/neo4j/memory/crud";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import { getDriver } from "../../../engine/neo4j/driver";
import type { UpdateMemoryInternalArgs } from "../../memoryApi/validators";
import { toMemoryStatus, toMemoryType } from "./shared";
import { scheduleAfterMemoryMutation } from "./lifecycle";

export async function runUpdateMemory(
  ctx: ActionCtx,
  args: UpdateMemoryInternalArgs,
): Promise<MemoryWithTags | null> {
  const driver = getDriver();
  const result = await updateMemory(driver, args.clerkId, args.memoryId, {
    title: args.title,
    content: args.content,
    type: toMemoryType(args.type),
    status: toMemoryStatus(args.status),
    tags: args.tags,
    confidence: args.confidence,
    expiresAt: args.expiresAt,
  });

  if (!result) return result;

  await scheduleAfterMemoryMutation(ctx, {
    clerkId: args.clerkId,
    event: {
      type: "memory_updated",
      memoryId: args.memoryId,
      payload: JSON.stringify({ title: result.title }),
    },
    chunk:
      args.content !== undefined
        ? {
            driver,
            memoryId: args.memoryId,
            content: args.content,
            mode: "update",
          }
        : undefined,
    checkDream: result.source !== "dream-mode",
  });

  return result;
}
