"use node";

import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { generateEmbedding } from "../../src/neo4j/embeddingService";
import { verifyMcpJwt } from "../../src/neo4j/mcpAuth";
import { normalizeUrl } from "../../src/neo4j/url";
import { tryUserEnvVarByClerkId } from "../lib/envVars";

/**
 * Best-effort embedding helper used by the MCP entry points. Returns null
 * when the user has no OPENROUTER_API_KEY set or the remote call fails —
 * downstream Cypher treats that as "no vector yet" and the retrieve/create
 * paths continue on the fulltext-only degraded path.
 */
async function tryEmbed(
  ctx: ActionCtx,
  clerkId: string,
  text: string,
): Promise<number[] | null> {
  try {
    const apiKey = await tryUserEnvVarByClerkId(
      ctx,
      clerkId,
      "OPENROUTER_API_KEY",
    );
    if (!apiKey) return null;
    return await generateEmbedding(apiKey, text);
  } catch (e) {
    console.warn("mcp embedding failed", e);
    return null;
  }
}

function verifyTokenOrThrow(token: string): string {
  const clerkId = verifyMcpJwt(token);
  if (!clerkId) throw new Error("Invalid or expired token");
  return clerkId;
}

/**
 * Resolve the profileId to use for a request.
 * Priority: explicit profileId > active profile > default profile
 *
 * Note: We don't validate explicit profileId ownership here since the memory
 * queries already filter by userId. If someone passes an invalid profileId,
 * they just get no results.
 */
async function resolveProfileId(
  ctx: ActionCtx,
  clerkId: string,
  explicitProfileId?: string,
): Promise<string> {
  // If explicit profileId provided, use it directly
  // (queries are already scoped to the user's memories)
  if (explicitProfileId) {
    return explicitProfileId;
  }

  // Get active profile or create default
  const profile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return profile._id;
}

export const mcpSearchMemories = internalAction({
  args: {
    token: v.string(),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = verifyTokenOrThrow(args.token);
    const profileId = await resolveProfileId(ctx, clerkId, args.profileId);
    const service = new MemoryService(getDriver());
    return await service.searchMemories({
      userId: clerkId,
      profileId,
      query: args.query,
      limit: args.limit ?? 20,
      offset: args.offset ?? 0,
    });
  },
});

export const mcpRetrieveMemories = internalAction({
  args: {
    token: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = verifyTokenOrThrow(args.token);
    const profileId = await resolveProfileId(ctx, clerkId, args.profileId);
    const service = new MemoryService(getDriver());
    const queryEmbedding = await tryEmbed(ctx, clerkId, args.query);
    return await service.retrieveMemories({
      userId: clerkId,
      profileId,
      query: args.query,
      queryEmbedding,
      limit: args.limit ?? 10,
    });
  },
});

export const mcpCreateMemory = internalAction({
  args: {
    token: v.string(),
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
    const clerkId = verifyTokenOrThrow(args.token);
    const profileId = await resolveProfileId(ctx, clerkId, args.profileId);
    const service = new MemoryService(getDriver());

    const normalizedUrl = args.url
      ? (normalizeUrl(args.url) ?? undefined)
      : undefined;

    if (normalizedUrl) {
      const existing = await service.findMemoryByUrl(clerkId, normalizedUrl);
      if (existing) {
        const full = await service.getMemory(clerkId, existing.id);
        if (full) return full;
      }
    }

    const embedding = await tryEmbed(
      ctx,
      clerkId,
      `${args.title}\n\n${args.content}`,
    );

    const result = await service.createMemory({
      userId: clerkId,
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
      url: normalizedUrl,
      embedding,
    });

    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId,
      eventType: "memory_created",
      memoryId: result.id,
      payload: JSON.stringify({ title: result.title }),
    });

    await ctx.runMutation(internal.pendingEnrichment.enqueuePendingInternal, {
      clerkId,
      memoryId: result.id,
      source: "mcp",
    });

    return result;
  },
});

export const mcpUpdateMemory = internalAction({
  args: {
    token: v.string(),
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const clerkId = verifyTokenOrThrow(args.token);
    const service = new MemoryService(getDriver());
    const result = await service.updateMemory(clerkId, args.memoryId, {
      title: args.title,
      content: args.content,
      tags: args.tags,
    });

    if (result) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId,
        eventType: "memory_updated",
        memoryId: args.memoryId,
        payload: JSON.stringify({ title: result.title }),
      });
    }

    return result;
  },
});

export const mcpDeleteMemory = internalAction({
  args: {
    token: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const clerkId = verifyTokenOrThrow(args.token);
    const service = new MemoryService(getDriver());
    const deleted = await service.deleteMemory(clerkId, args.memoryId);

    if (deleted) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId,
        eventType: "memory_deleted",
        memoryId: args.memoryId,
        payload: JSON.stringify({}),
      });
    }

    return deleted;
  },
});
