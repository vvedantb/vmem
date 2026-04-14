"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { verifyMcpJwt } from "../../src/neo4j/mcpAuth";
import { normalizeUrl } from "../../src/neo4j/url";

function verifyTokenOrThrow(token: string): string {
  const clerkId = verifyMcpJwt(token);
  if (!clerkId) throw new Error("Invalid or expired token");
  return clerkId;
}

export const mcpSearchMemories = internalAction({
  args: {
    token: v.string(),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const clerkId = verifyTokenOrThrow(args.token);
    const service = new MemoryService(getDriver());
    return await service.searchMemories({
      userId: clerkId,
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
  },
  handler: async (_ctx, args) => {
    const clerkId = verifyTokenOrThrow(args.token);
    const service = new MemoryService(getDriver());
    return await service.retrieveMemories({
      userId: clerkId,
      query: args.query,
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
  },
  handler: async (ctx, args) => {
    const clerkId = verifyTokenOrThrow(args.token);
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

    const result = await service.createMemory({
      userId: clerkId,
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
    });

    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId,
      eventType: "memory_created",
      memoryId: result.id,
      payload: JSON.stringify({ title: result.title }),
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
