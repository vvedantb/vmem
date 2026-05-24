import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";

interface MemoryWithTags {
  id: string;
  userId: string;
  title: string;
  content: string;
  type: string;
  source: string;
  sourceUrl: string | null;
  sourceSyncedAt: string | null;
  confidence: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  tags: string[];
}

interface RelatedMemory {
  memory: MemoryWithTags;
  reason: string;
}

interface RelationshipEdge {
  source: string;
  target: string;
  reason: string;
}

export const linkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.relationships.linkMemoriesInternal,
      {
        clerkId,
        memoryIdA: args.memoryIdA,
        memoryIdB: args.memoryIdB,
        reason: args.reason,
      },
    );
  },
});

export const unlinkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.relationships.unlinkMemoriesInternal,
      {
        clerkId,
        memoryIdA: args.memoryIdA,
        memoryIdB: args.memoryIdB,
      },
    );
  },
});

export const getRelatedMemories = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<RelatedMemory[]> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.relationships.getRelatedMemoriesInternal,
      {
        clerkId,
        memoryId: args.memoryId,
      },
    );
  },
});

export const getAllRelationships = authAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<RelationshipEdge[]> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.relationships.getAllRelationshipsInternal,
      {
        clerkId,
        limit: args.limit,
      },
    );
  },
});
