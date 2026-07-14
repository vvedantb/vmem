"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { runUpdateMemory } from "./_memories/update";
import { runDeleteMemory } from "./_memories/delete";
import { runCreateMemory } from "./_memories/create";
import { runRetrieveMemories, runSearchMemories } from "./_memories/read";
import { runSearchMemoriesForTeam } from "./_memories/team";
import { toMemoryType } from "./_memories/shared";
import { runStoreFromInstruction } from "./agent/storeFromInstruction";
import type { OpenRouterRequired } from "./agent/shared";
import type { StoreFromInstructionResult } from "./agent/storeFromInstruction";
import { getRelatedMemories } from "../../engine/neo4j/memory/relationships";
import { getDriver } from "../../engine/neo4j/driver";
import type { MemoryWithTags } from "../../engine/neo4j/memory/types";
import {
  loadMemoryForMcpScope,
  memoryMatchesMcpScope,
  runForMcpScope,
  scopedMcpArgs,
  toTeamRetrieveCandidates,
  withMcpMemoryScope,
  type McpResolvedScope,
} from "./mcpScope";

export interface RelatedMemoryRow {
  memory: MemoryWithTags;
  linkReason: string;
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
  handler: async (ctx, args) =>
    withMcpMemoryScope(ctx, args, (scope) => {
      const limit = args.limit ?? 20;
      const offset = args.offset ?? 0;
      return runForMcpScope(scope, {
        team: (profileId) =>
          runSearchMemoriesForTeam({
            profileId,
            query: args.query,
            type: args.type,
            tags: args.tags,
            limit,
            offset,
          }),
        personal: ({ clerkId, profileId }) =>
          runSearchMemories({
            clerkId,
            profileId,
            query: args.query,
            type: args.type,
            tags: args.tags,
            limit,
            offset,
          }),
      });
    }),
});

export const mcpRetrieveMemories = internalAction({
  args: {
    ...scopedMcpArgs,
    query: v.string(),
    limit: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    withMcpMemoryScope(ctx, args, (scope) => {
      const limit = args.limit ?? 10;
      return runForMcpScope(scope, {
        team: async (profileId) => {
          const result = await runSearchMemoriesForTeam({
            profileId,
            query: args.query,
            limit,
            offset: 0,
          });
          return toTeamRetrieveCandidates(result.memories);
        },
        personal: ({ clerkId, profileId }) =>
          runRetrieveMemories(ctx, {
            clerkId,
            profileId,
            query: args.query,
            limit,
          }),
      });
    }),
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
  handler: async (ctx, args) =>
    withMcpMemoryScope(ctx, args, (scope) =>
      runCreateMemory(ctx, {
        clerkId: scope.clerkId,
        profileId: scope.profileId,
        title: args.title,
        content: args.content,
        type: toMemoryType(args.type) ?? "knowledge",
        source: args.source ?? "mcp",
        tags: args.tags ?? [],
        confidence: args.confidence ?? 1.0,
        url: args.url,
      }),
    ),
});

async function loadScopedMemory(scope: McpResolvedScope, memoryId: string) {
  return loadMemoryForMcpScope({
    clerkId: scope.clerkId,
    mcpScope: scope.mcpScope,
    profileId: scope.profileId,
    memoryId,
  });
}

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
  handler: async (ctx, args) =>
    withMcpMemoryScope(ctx, args, async (scope) => {
      const memory = await loadScopedMemory(scope, args.memoryId);
      const {
        clerkId: _clerkId,
        mcpScope: _mcpScope,
        memoryId,
        profileId: _profileId,
        ...patch
      } = args;
      return runUpdateMemory(ctx, {
        clerkId: memory.userId,
        memoryId,
        ...patch,
      });
    }),
});

export const mcpDeleteMemory = internalAction({
  args: {
    ...scopedMcpArgs,
    memoryId: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    withMcpMemoryScope(ctx, args, async (scope) => {
      const memory = await loadScopedMemory(scope, args.memoryId);
      return runDeleteMemory(ctx, {
        clerkId: memory.userId,
        memoryId: args.memoryId,
      });
    }),
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
  ): Promise<StoreFromInstructionResult | OpenRouterRequired> =>
    withMcpMemoryScope(ctx, args, (scope) =>
      runStoreFromInstruction(ctx, {
        clerkId: scope.clerkId,
        instruction: args.instruction,
        profileId: scope.profileId,
      }),
    ),
});

export const mcpGetRelatedMemories = internalAction({
  args: {
    ...scopedMcpArgs,
    memoryId: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<RelatedMemoryRow[]> =>
    withMcpMemoryScope(ctx, args, async (scope) => {
      const memory = await loadScopedMemory(scope, args.memoryId);
      const rows = await getRelatedMemories(
        getDriver(),
        memory.userId,
        args.memoryId,
      );
      return rows
        .filter((row) =>
          memoryMatchesMcpScope(row.memory, scope.mcpScope, scope.profileId),
        )
        .map((row) => ({
          memory: row.memory,
          linkReason: row.reason,
        }));
    }),
});
