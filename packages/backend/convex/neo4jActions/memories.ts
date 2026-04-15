"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { normalizeUrl } from "../../src/neo4j/url";

type MemoryType = "profile" | "episodic" | "knowledge";
type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

const MEMORY_TYPES: ReadonlySet<string> = new Set([
  "profile",
  "episodic",
  "knowledge",
]);
const MEMORY_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

function toMemoryType(s: string | undefined): MemoryType | undefined {
  if (s === undefined) return undefined;
  return MEMORY_TYPES.has(s) ? (s as MemoryType) : undefined;
}

function toMemoryStatus(s: string | undefined): MemoryStatus | undefined {
  if (s === undefined) return undefined;
  return MEMORY_STATUSES.has(s) ? (s as MemoryStatus) : undefined;
}

export const createMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    title: v.string(),
    content: v.string(),
    type: v.string(),
    source: v.string(),
    tags: v.array(v.string()),
    confidence: v.number(),
    expiresAt: v.optional(v.string()),
    url: v.optional(v.string()),
    queueForLocalEnrichment: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    const memoryType =
      args.type === "profile" || args.type === "episodic"
        ? args.type
        : "knowledge";

    // Normalize URL if provided
    const normalizedUrl = args.url
      ? (normalizeUrl(args.url) ?? undefined)
      : undefined;

    // Check for existing memory with same URL — return full memory if found
    if (normalizedUrl) {
      const existing = await service.findMemoryByUrl(
        args.clerkId,
        normalizedUrl,
      );
      if (existing) {
        const full = await service.getMemory(args.clerkId, existing.id);
        if (full) return full;
      }
    }

    const result = await service.createMemory({
      userId: args.clerkId,
      title: args.title,
      content: args.content,
      type: memoryType,
      source: args.source,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
      url: normalizedUrl,
    });

    // Push memory event via direct mutation
    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId: args.clerkId,
      eventType: "memory_created",
      memoryId: result.id,
      payload: JSON.stringify({ title: result.title }),
    });

    if (args.queueForLocalEnrichment === true) {
      await ctx.runMutation(internal.pendingEnrichment.enqueuePendingInternal, {
        clerkId: args.clerkId,
        memoryId: result.id,
        source: "import",
      });
    }

    return result;
  },
});

export const getMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getMemory(args.clerkId, args.memoryId);
  },
});

export const listMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.listMemories({
      userId: args.clerkId,
      type: toMemoryType(args.type),
      status: toMemoryStatus(args.status),
      tags: args.tags,
      limit: args.limit,
      offset: args.offset,
    });
  },
});

export const updateMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    const result = await service.updateMemory(args.clerkId, args.memoryId, {
      title: args.title,
      content: args.content,
      type: toMemoryType(args.type),
      status: toMemoryStatus(args.status),
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
    });

    if (result) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "memory_updated",
        memoryId: args.memoryId,
        payload: JSON.stringify({ title: result.title }),
      });
    }

    return result;
  },
});

export const deleteMemoryInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    const deleted = await service.deleteMemory(args.clerkId, args.memoryId);

    if (deleted) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "memory_deleted",
        memoryId: args.memoryId,
        payload: JSON.stringify({}),
      });
    }

    return deleted;
  },
});

export const searchMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.searchMemories({
      userId: args.clerkId,
      query: args.query,
      type: toMemoryType(args.type),
      tags: args.tags,
      source: args.source,
      limit: args.limit,
      offset: args.offset,
    });
  },
});

export const retrieveMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    query: v.string(),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.retrieveMemories({
      userId: args.clerkId,
      query: args.query,
      type: toMemoryType(args.type),
      tags: args.tags,
      limit: args.limit,
    });
  },
});

export const getMemoryEventsInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getMemoryEvents(args.clerkId, args.memoryId);
  },
});

export const getRecentMemoryTitlesInternal = internalAction({
  args: {
    clerkId: v.string(),
    excludeMemoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.getRecentMemoryTitles(
      args.clerkId,
      args.excludeMemoryId,
    );
  },
});
