"use node";

/**
 * MCP memory tool entry points. Delegate to the canonical memory handlers
 * in `./memories/*` so dedup, chunking, V2 fact extraction, and context-
 * prompt invalidation stay consistent with the UI and HTTP v1 API paths.
 */

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { runCreateMemory } from "./memories/create";
import { runUpdateMemory } from "./memories/update";
import { runDeleteMemory } from "./memories/delete";
import { runRetrieveMemories, runSearchMemories } from "./memories/read";
import { resolveProfileIdForClerkId } from "./memories/shared";
import { runStoreFromInstruction } from "./agent/storeFromInstruction";
import type { OpenRouterRequired } from "./agent/shared";
import type { StoreFromInstructionResult } from "./agent/storeFromInstruction";
import type { MemoryWithTags } from "../../src/neo4j/memoryService";
import { getRelatedMemories } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

export interface RelatedMemoryRow {
  memory: MemoryWithTags;
  linkReason: string;
}

export const mcpSearchMemories = internalAction({
  args: {
    clerkId: v.string(),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileIdForClerkId(
      ctx,
      args.clerkId,
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
    clerkId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileIdForClerkId(
      ctx,
      args.clerkId,
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
    clerkId: v.string(),
    title: v.string(),
    content: v.string(),
    type: v.optional(v.string()),
    source: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    url: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    runCreateMemory(ctx, {
      clerkId: args.clerkId,
      profileId: args.profileId,
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
    }),
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
    clerkId: v.string(),
    instruction: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<StoreFromInstructionResult | OpenRouterRequired> =>
    runStoreFromInstruction(ctx, args),
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
