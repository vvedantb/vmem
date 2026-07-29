"use node";

import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Driver } from "neo4j-driver";
import { shouldChunk } from "../../../engine/neo4j/chunking";
import { deleteChunksForMemory } from "../../../engine/neo4j/memory/chunks";
import {
  toMemoryStatusOrUndefined,
  toMemoryTypeOrUndefined,
} from "../../../engine/neo4j/memory/mappers";
import type { ScopeKind } from "../../../engine/neo4j/memory/scope";
import type { McpScope } from "../../profiles/mcpAccess";

// stable wrappers, call sites keep importing from this module
export const toMemoryType = toMemoryTypeOrUndefined;
export const toMemoryStatus = toMemoryStatusOrUndefined;

export async function resolveProfileScopeForClerkId(
  ctx: ActionCtx,
  clerkId: string,
  explicitProfileId?: string,
): Promise<{ profileId: string; graphScope: ScopeKind }> {
  if (explicitProfileId) {
    const graphScope = await ctx.runQuery(
      internal.profiles.getProfileScopeInternal,
      { profileId: explicitProfileId },
    );
    return { profileId: explicitProfileId, graphScope };
  }

  // active mcp profile and the default profile are always personal, see getActiveProfileForMcpScope / getOrCreateDefaultProfile
  const mcpActive = await ctx.runQuery(
    internal.profiles.getActiveProfileForMcpInternal,
    { clerkId },
  );
  if (mcpActive) {
    return { profileId: mcpActive._id, graphScope: "personal" };
  }

  const profile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return { profileId: profile._id, graphScope: "personal" };
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
