import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";

// --- Return type interfaces (match MemoryService shapes) ---

interface MemoryWithTags {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  source: string;
  confidence: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  tags: string[];
}

interface MemoryListResult {
  memories: MemoryWithTags[];
  total: number;
}

interface ScoreBreakdown {
  fulltext: number;
  recency: number;
  confidence: number;
}

interface MemoryCandidate extends MemoryWithTags {
  trace: {
    score: number;
    scoreBreakdown: ScoreBreakdown;
    reason: string;
  };
}

interface MemorySnapshot {
  title: string;
  content: string;
  type: string;
  status: string;
  confidence: number;
  tags: string[];
}

interface MemoryEvent {
  id: string;
  action: string;
  actor: string;
  details: Record<string, string> | null;
  snapshot: MemorySnapshot | null;
  createdAt: string;
}

// --- Actions ---

export const createMemory = authAction({
  args: {
    title: v.string(),
    content: v.string(),
    type: v.string(),
    source: v.string(),
    tags: v.array(v.string()),
    confidence: v.number(),
    expiresAt: v.optional(v.string()),
    url: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MemoryWithTags> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.createMemoryInternal,
      {
        clerkId,
        title: args.title,
        content: args.content,
        type: args.type,
        source: args.source,
        tags: args.tags,
        confidence: args.confidence,
        expiresAt: args.expiresAt,
        url: args.url,
      },
    );
  },
});

export const getMemory = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<MemoryWithTags | null> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.getMemoryInternal,
      {
        clerkId,
        memoryId: args.memoryId,
      },
    );
  },
});

export const listMemories = authAction({
  args: {
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.listMemoriesInternal,
      {
        clerkId,
        type: args.type,
        status: args.status,
        tags: args.tags,
        limit: args.limit,
        offset: args.offset,
      },
    );
  },
});

export const updateMemory = authAction({
  args: {
    memoryId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    type: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    confidence: v.optional(v.number()),
    expiresAt: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<MemoryWithTags | null> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.updateMemoryInternal,
      {
        clerkId,
        memoryId: args.memoryId,
        title: args.title,
        content: args.content,
        type: args.type,
        status: args.status,
        tags: args.tags,
        confidence: args.confidence,
        expiresAt: args.expiresAt,
      },
    );
  },
});

export const deleteMemory = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<boolean> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.deleteMemoryInternal,
      {
        clerkId,
        memoryId: args.memoryId,
      },
    );
  },
});

export const searchMemories = authAction({
  args: {
    query: v.optional(v.string()),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    source: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryListResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.searchMemoriesInternal,
      {
        clerkId,
        query: args.query,
        type: args.type,
        tags: args.tags,
        source: args.source,
        limit: args.limit,
        offset: args.offset,
      },
    );
  },
});

export const retrieveMemories = authAction({
  args: {
    query: v.string(),
    type: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    limit: v.number(),
  },
  handler: async (ctx, args): Promise<MemoryCandidate[]> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.retrieveMemoriesInternal,
      {
        clerkId,
        query: args.query,
        type: args.type,
        tags: args.tags,
        limit: args.limit,
      },
    );
  },
});

export const getMemoryEvents = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<MemoryEvent[]> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.memories.getMemoryEventsInternal,
      {
        clerkId,
        memoryId: args.memoryId,
      },
    );
  },
});

/**
 * Apply client-side enrichment (tags) to a memory.
 * Used by Chrome extension when local LLM enrichment is enabled.
 */
export const applyEnrichment = authAction({
  args: {
    memoryId: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ applied: boolean }> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.enrichment.applyEnrichmentInternal,
      {
        clerkId,
        memoryId: args.memoryId,
        tags: args.tags,
      },
    );
  },
});
