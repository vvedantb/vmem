"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  createChunksForMemory,
  deleteChunksForMemory,
  findUnchunkedLongMemories,
} from "../../../engine/neo4j/memory/chunks";
import { getMemory } from "../../../engine/neo4j/memory/crud";
import { getDriver } from "../../../engine/neo4j/driver";
import { chunkText } from "../../../engine/neo4j/chunking";
import { bestEffortEmbedMany } from "../../lib/openRouter/bestEffortEmbed";

export interface ChunkMemoryArgs {
  clerkId: string;
  memoryId: string;
  content: string;
  profileId?: string;
}

export async function runChunkMemory(
  ctx: ActionCtx,
  args: ChunkMemoryArgs,
): Promise<void> {
  const driver = getDriver();

  const chunks = chunkText(args.content);
  if (chunks.length === 0) return;

  let resolvedProfileId = args.profileId;
  if (!resolvedProfileId) {
    const parent = await getMemory(driver, args.clerkId, args.memoryId);
    resolvedProfileId = parent?.profileId ?? undefined;
  }

  const embeddings = await bestEffortEmbedMany({
    ctx,
    clerkId: args.clerkId,
    profileId: resolvedProfileId,
    feature: "memory-save",
    texts: chunks.map((c) => c.content),
    failureLog: `[chunk-pipeline] embedding failed for memory ${args.memoryId}`,
  });

  await deleteChunksForMemory(driver, args.clerkId, args.memoryId);
  await createChunksForMemory(driver, {
    memoryId: args.memoryId,
    userId: args.clerkId,
    chunks,
    embeddings,
  });
}

export interface BackfillChunksArgs {
  clerkId: string;
  limit?: number;
}

export async function runBackfillChunks(
  ctx: ActionCtx,
  args: BackfillChunksArgs,
): Promise<{ processed: number; hasMore: boolean }> {
  const driver = getDriver();
  const limit = args.limit ?? 25;

  const candidates = await findUnchunkedLongMemories(
    driver,
    args.clerkId,
    2000,
    limit,
  );
  if (candidates.length === 0) {
    console.log(`[chunk-backfill] no unchunked memories for ${args.clerkId}`);
    return { processed: 0, hasMore: false };
  }

  for (const memory of candidates) {
    await runChunkMemory(ctx, {
      clerkId: args.clerkId,
      memoryId: memory.id,
      content: memory.content,
    });
  }

  const hasMore = candidates.length === limit;
  if (hasMore) {
    await ctx.scheduler.runAfter(
      5000,
      internal.neo4jActions.memories.backfillChunksInternal,
      { clerkId: args.clerkId, limit },
    );
  }

  return { processed: candidates.length, hasMore };
}
