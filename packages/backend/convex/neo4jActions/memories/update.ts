"use node";

/**
 * Memory update handler. Pushes a `memory_updated` event, rebuilds
 * chunks if content changed (or deletes them if content shrank below
 * the chunking threshold), and triggers context_prompt invalidation.
 */

import { type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  deleteChunksForMemory,
  updateMemory,
  type MemoryWithTags,
} from "../../../src/neo4j/memoryService";
import { getDriver } from "../../../src/neo4j/driver";
import { shouldChunk } from "../../../src/neo4j/chunking";
import {
  scheduleContextPromptInvalidation,
  toMemoryStatus,
  toMemoryType,
} from "./shared";

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

  // If content was updated, rebuild chunks. We always re-chunk on
  // content change rather than diffing because chunks are a derived
  // representation — any partial update would risk leaving stale
  // chunks that drift from the source. `chunkMemoryInternal` deletes
  // existing chunks before inserting new ones.
  if (args.content !== undefined) {
    if (shouldChunk(args.content)) {
      await ctx.scheduler.runAfter(
        0,
        internal.neo4jActions.memories.chunkMemoryInternal,
        {
          clerkId: args.clerkId,
          memoryId: args.memoryId,
          content: args.content,
        },
      );
    } else {
      // Content shrank below the chunking threshold — clean up chunks
      // so retrieval doesn't surface stale long-content matches.
      await deleteChunksForMemory(driver, args.clerkId, args.memoryId);
    }
  }

  await scheduleContextPromptInvalidation(ctx, args.clerkId);

  return result;
}
