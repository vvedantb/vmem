"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Driver } from "neo4j-driver";
import {
  bestEffortEmbedMany,
  bestEffortEmbedOne,
  type BestEffortEmbedParams,
} from "../../lib/openRouter/bestEffortEmbed";
import { shouldChunk } from "../../../engine/neo4j/chunking";
import { deleteChunksForMemory } from "../../../engine/neo4j/memory/chunks";
import {
  toMemoryStatusOrUndefined,
  toMemoryTypeOrUndefined,
} from "../../../engine/neo4j/memory/mappers";
import type { McpScope } from "../../profiles/mcpAccess";

/** Stable wrappers — call sites keep importing from this module. */
export const toMemoryType = toMemoryTypeOrUndefined;
export const toMemoryStatus = toMemoryStatusOrUndefined;

export async function resolveProfileIdForClerkId(
  ctx: ActionCtx,
  clerkId: string,
  explicitProfileId?: string,
): Promise<string> {
  if (explicitProfileId) {
    return explicitProfileId;
  }

  const mcpActive = await ctx.runQuery(
    internal.profiles.getActiveProfileForMcpInternal,
    { clerkId },
  );
  if (mcpActive) {
    return mcpActive._id;
  }

  const profile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return profile._id;
}

export async function resolveProfileIdForMcpScope(
  ctx: ActionCtx,
  clerkId: string,
  scope: McpScope,
  explicitProfileId?: string,
): Promise<string> {
  return ctx.runQuery(internal.profiles.resolveProfileIdForMcpScopeInternal, {
    clerkId,
    scope,
    profileId: explicitProfileId,
  });
}

type EmbedArgs = Omit<BestEffortEmbedParams, "ctx">;

export function tryEmbedOne(
  ctx: ActionCtx,
  args: EmbedArgs & { text: string },
): Promise<number[] | null> {
  return bestEffortEmbedOne({ ctx, ...args });
}

export function tryEmbedMany(
  ctx: ActionCtx,
  args: EmbedArgs & { texts: string[] },
): Promise<(number[] | null)[]> {
  return bestEffortEmbedMany({ ctx, ...args });
}

export async function scheduleChunkSyncForContent(
  ctx: ActionCtx,
  driver: Driver,
  opts: {
    clerkId: string;
    memoryId: string;
    content: string;
    profileId?: string;
    mode: "create" | "update";
  },
): Promise<void> {
  if (shouldChunk(opts.content)) {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.memories.chunkMemoryInternal,
      {
        clerkId: opts.clerkId,
        memoryId: opts.memoryId,
        content: opts.content,
        profileId: opts.profileId,
      },
    );
    return;
  }
  if (opts.mode === "update") {
    await deleteChunksForMemory(driver, opts.clerkId, opts.memoryId);
  }
}
