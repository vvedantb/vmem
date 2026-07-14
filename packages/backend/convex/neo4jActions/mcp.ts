"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { runUpdateMemory } from "./_memories/update";
import { runDeleteMemory } from "./_memories/delete";
import { runCreateMemory } from "./_memories/create";
import { runRetrieveMemories, runSearchMemories } from "./_memories/read";
import {
  runGetMemoryForTeam,
  runSearchMemoriesForTeam,
} from "./_memories/team";
import { resolveProfileIdForMcpScope, toMemoryType } from "./_memories/shared";
import { runStoreFromInstruction } from "./agent/storeFromInstruction";
import type { OpenRouterRequired } from "./agent/shared";
import type { StoreFromInstructionResult } from "./agent/storeFromInstruction";
import type {
  MemoryCandidate,
  MemoryWithTags,
} from "../../engine/neo4j/memory/types";
import { getRelatedMemories } from "../../engine/neo4j/memory/relationships";
import { getMemory } from "../../engine/neo4j/memory/crud";
import { getDriver } from "../../engine/neo4j/driver";
import { mcpScopeValidator, type McpScope } from "../profiles/mcpAccess";

export interface RelatedMemoryRow {
  memory: MemoryWithTags;
  linkReason: string;
}

const scopedMcpArgs = {
  clerkId: v.string(),
  mcpScope: mcpScopeValidator,
};

function memoryMatchesMcpScope(
  memory: MemoryWithTags,
  mcpScope: McpScope,
  profileId: string,
): boolean {
  if (mcpScope === "team") {
    return memory.profileId === profileId;
  }
  return memory.profileId === profileId || memory.profileId === null;
}

async function loadMemoryForMcpScope(args: {
  clerkId: string;
  mcpScope: McpScope;
  profileId: string;
  memoryId: string;
}): Promise<MemoryWithTags> {
  if (args.mcpScope === "team") {
    const memory = await runGetMemoryForTeam({
      profileId: args.profileId,
      memoryId: args.memoryId,
    });
    if (!memory) {
      throw new Error("Memory not found");
    }
    return memory;
  }

  const memory = await getMemory(getDriver(), args.clerkId, args.memoryId);
  if (
    !memory ||
    !memoryMatchesMcpScope(memory, args.mcpScope, args.profileId)
  ) {
    throw new Error("Memory not found");
  }
  return memory;
}

function toTeamRetrieveCandidates(
  memories: MemoryWithTags[],
): MemoryCandidate[] {
  return memories.map((memory, index) => ({
    ...memory,
    trace: {
      score: 1 / (index + 1),
      scoreBreakdown: {
        fulltext: 1 / (index + 1),
        vector: 0,
        chunk: 0,
        entity: 0,
        rrf: 1 / (index + 1),
        recency: 0,
        confidence: memory.confidence,
      },
      reason: "team profile search",
    },
  }));
}

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
    if (args.mcpScope === "team") {
      return await runSearchMemoriesForTeam({
        profileId,
        query: args.query,
        type: args.type,
        tags: args.tags,
        limit: args.limit ?? 20,
        offset: args.offset ?? 0,
      });
    }
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
    if (args.mcpScope === "team") {
      const result = await runSearchMemoriesForTeam({
        profileId,
        query: args.query,
        limit: args.limit ?? 10,
        offset: 0,
      });
      return toTeamRetrieveCandidates(result.memories);
    }
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
      type: toMemoryType(args.type) ?? "knowledge",
      source: args.source ?? "mcp",
      tags: args.tags ?? [],
      confidence: args.confidence ?? 1.0,
      url: args.url,
    });
  },
});

export const mcpUpdateMemory = internalAction({
  args: {
    ...scopedMcpArgs,
    memoryId: v.string(),
    profileId: v.optional(v.string()),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.mcpScope,
      args.profileId,
    );
    const memory = await loadMemoryForMcpScope({
      clerkId: args.clerkId,
      mcpScope: args.mcpScope,
      profileId,
      memoryId: args.memoryId,
    });
    return runUpdateMemory(ctx, {
      clerkId: memory.userId,
      memoryId: args.memoryId,
      title: args.title,
      content: args.content,
      type: args.type,
      status: args.status,
      tags: args.tags,
      confidence: args.confidence,
    });
  },
});

export const mcpDeleteMemory = internalAction({
  args: {
    ...scopedMcpArgs,
    memoryId: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profileId = await resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.mcpScope,
      args.profileId,
    );
    const memory = await loadMemoryForMcpScope({
      clerkId: args.clerkId,
      mcpScope: args.mcpScope,
      profileId,
      memoryId: args.memoryId,
    });
    return runDeleteMemory(ctx, {
      clerkId: memory.userId,
      memoryId: args.memoryId,
    });
  },
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
    ...scopedMcpArgs,
    memoryId: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RelatedMemoryRow[]> => {
    const profileId = await resolveProfileIdForMcpScope(
      ctx,
      args.clerkId,
      args.mcpScope,
      args.profileId,
    );
    const memory = await loadMemoryForMcpScope({
      clerkId: args.clerkId,
      mcpScope: args.mcpScope,
      profileId,
      memoryId: args.memoryId,
    });
    const driver = getDriver();
    const rows = await getRelatedMemories(driver, memory.userId, args.memoryId);
    return rows
      .filter((row) =>
        memoryMatchesMcpScope(row.memory, args.mcpScope, profileId),
      )
      .map((row) => ({
        memory: row.memory,
        linkReason: row.reason,
      }));
  },
});
