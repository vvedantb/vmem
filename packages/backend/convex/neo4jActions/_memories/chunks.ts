"use node";

/**
 * Chunk pipeline: paragraph-level retrieval anchors for long memories.
 *
 * - `runChunkMemory` is scheduled by `runCreateMemory` (and the update
 *   handler) when a memory's content exceeds the chunking threshold.
 * - `runBackfillChunks` is the one-shot migration for pre-existing long
 *   memories. Self-schedules a follow-up batch when more remain.
 *
 * Both are best-effort — failures are logged but never bubble up. The
 * whole-memory embedding still drives retrieval, so a memory without
 * chunks is degraded but functional.
 */

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
import { tryEmbedMany } from "./shared";

export interface ChunkMemoryArgs {
  clerkId: string;
  memoryId: string;
  content: string;
  /** Optional — when supplied, threaded onto the openRouterLogs row so
   *  spend attributes to the right workspace. When omitted (e.g. legacy
   *  callers) the row is logged with no profileId. */
  profileId?: string;
}

export async function runChunkMemory(
  ctx: ActionCtx,
  args: ChunkMemoryArgs,
): Promise<void> {
  const driver = getDriver();

  const chunks = chunkText(args.content);
  if (chunks.length === 0) return;

  // Resolve profileId from the parent memory when not passed by the
  // caller — keeps the openRouterLogs row attributable on backfill paths.
  let resolvedProfileId = args.profileId;
  if (!resolvedProfileId) {
    const parent = await getMemory(driver, args.clerkId, args.memoryId);
    resolvedProfileId = parent?.profileId ?? undefined;
  }

  const embeddings = await tryEmbedMany(ctx, {
    clerkId: args.clerkId,
    profileId: resolvedProfileId,
    feature: "memory-save",
    texts: chunks.map((c) => c.content),
    failureLog: `[chunk-pipeline] embedding failed for memory ${args.memoryId}`,
  });

  // Replace any existing chunks (e.g. backfill re-run) before inserting
  // fresh ones so we don't duplicate.
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
  /** Max memories to chunk per invocation. Default 25 keeps under 5 min. */
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
    await ctx.runAction(internal.neo4jActions.memories.chunkMemoryInternal, {
      clerkId: args.clerkId,
      memoryId: memory.id,
      content: memory.content,
    });
  }

  const hasMore = candidates.length === limit;
  if (hasMore) {
    // Self-schedule the next batch with a small delay so we yield the
    // runtime and don't hammer Neo4j or OpenRouter rate limits.
    await ctx.scheduler.runAfter(
      5000,
      internal.neo4jActions.memories.backfillChunksInternal,
      { clerkId: args.clerkId, limit },
    );
  }

  return { processed: candidates.length, hasMore };
}
