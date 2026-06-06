"use node";

/**
 * MCP memory tool entry points. Delegate to the canonical memory handlers
 * in `./memories/*` so dedup, chunking, V2 fact extraction, and context-
 * prompt invalidation stay consistent with the UI and HTTP v1 API paths.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { runUpdateMemory } from "./_memories/update";
import { runDeleteMemory } from "./_memories/delete";
import { runCreateMemory } from "./_memories/create";
import { runRetrieveMemories, runSearchMemories } from "./_memories/read";
import { resolveProfileIdForMcpScope } from "./_memories/shared";
import { runStoreFromInstruction } from "./agent/storeFromInstruction";
import type { OpenRouterRequired } from "./agent/shared";
import type { StoreFromInstructionResult } from "./agent/storeFromInstruction";
import type { MemoryWithTags } from "../../engine/neo4j/memory/types";
import { getRelatedMemories } from "../../engine/neo4j/memory/relationships";
import { getDriver } from "../../engine/neo4j/driver";
import { mcpScopeValidator } from "../profiles/mcpAccess";

export interface RelatedMemoryRow {
  memory: MemoryWithTags;
  linkReason: string;
}

const scopedMcpArgs = {
  clerkId: v.string(),
  mcpScope: mcpScopeValidator,
};

export const mcpSearchMemories = internalAction({
  args: {
    ...scopedMcpArgs,
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.mcpScope,
      args.profileId,
    );
    return await runSearchMemories({
      clerkId: args.clerkId,
      profileId,
      query: args.query,
      type: args.type,
      tags: args.tags,
      limit: args.limit ?? 20,
      offset: args.offset ?? 0,
    });
  },
});

export const mcpRetrieveMemories = internalAction({
  args: {
    ...scopedMcpArgs,
    query: v.string(),
    limit: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.mcpScope,
      args.profileId,
    );
    return await runRetrieveMemories(ctx, {
      clerkId: args.clerkId,
      profileId,
      query: args.query,
      limit: args.limit ?? 10,
    });
  },
});

export const mcpCreateMemory = internalAction({
  args: {
    ...scopedMcpArgs,
    title: v.string(),
    content: v.string(),
    type: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    url: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.mcpScope,
      args.profileId,
    );
    return runCreateMemory(ctx, {
      clerkId: args.clerkId,
      profileId,
      title: args.title,
      content: args.content,
      type:
        args.type === "profile" || args.type === "episodic"
          ? args.type
          : "knowledge",
      source: args.source ?? "mcp",
      tags: args.tags ?? [],
      confidence: args.confidence ?? 1.0,
      url: args.url,
    });
  },
});

export const mcpUpdateMemory = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => runUpdateMemory(ctx, args),
});

export const mcpDeleteMemory = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => runDeleteMemory(ctx, args),
});

export const mcpAddFromInstruction = internalAction({
  args: {
    ...scopedMcpArgs,
    instruction: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<StoreFromInstructionResult | OpenRouterRequired> => {
    const profileId = await resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.mcpScope,
      args.profileId,
    );
    return runStoreFromInstruction(ctx, {
      clerkId: args.clerkId,
      instruction: args.instruction,
      profileId,
    });
  },
});

export const mcpGetRelatedMemories = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args): Promise<RelatedMemoryRow[]> => {
    const driver = getDriver();
    const rows = await getRelatedMemories(driver, args.clerkId, args.memoryId);
    return rows.map((row) => ({
      memory: row.memory,
      linkReason: row.reason,
    }));
  },
});
