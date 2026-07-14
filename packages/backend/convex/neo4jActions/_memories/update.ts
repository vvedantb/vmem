"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { updateMemory } from "../../../engine/neo4j/memory/crud";
import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import { getDriver } from "../../../engine/neo4j/driver";
import {
  scheduleChunkSyncForContent,
  toMemoryStatus,
  toMemoryType,
} from "./shared";
import { scheduleDreamTriggerCheck } from "../../lib/dreamTriggerInvalidate";
import { scheduleContextPromptInvalidationByClerkId } from "../../lib/contextPromptInvalidate";

export interface UpdateMemoryArgs {
  clerkId: string;
  memoryId: string;
  title?: string;
  content?: string;
  type?: string;
  status?: string;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
}

export async function runUpdateMemory(
  ctx: ActionCtx,
  args: UpdateMemoryArgs,
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

  await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
    clerkId: args.clerkId,
    eventType: "memory_updated",
    memoryId: args.memoryId,
    payload: JSON.stringify({ title: result.title }),
  });

  if (args.content !== undefined) {
    await scheduleChunkSyncForContent(ctx, driver, {
      clerkId: args.clerkId,
      memoryId: args.memoryId,
      content: args.content,
      mode: "update",
    });
  }

  await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);

  if (result.source !== "dream-mode") {
    await scheduleDreamTriggerCheck(ctx, args.clerkId);
  }

  return result;
}
