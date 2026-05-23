"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  getAllRelationships,
  getRelatedMemories,
  linkMemories,
  unlinkMemories,
} from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

export const linkMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryIdA: v.string(),
    memoryIdB: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();
    const linked = await linkMemories(
      driver,
      args.clerkId,
      args.memoryIdA,
      args.memoryIdB,
      args.reason,
    );

    if (linked) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "relationship_created",
        memoryId: args.memoryIdA,
        payload: JSON.stringify({
          linkedTo: args.memoryIdB,
          reason: args.reason,
        }),
      });
    }

    return linked;
  },
});

export const unlinkMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryIdA: v.string(),
    memoryIdB: v.string(),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();
    const unlinked = await unlinkMemories(
      driver,
      args.clerkId,
      args.memoryIdA,
      args.memoryIdB,
    );

    if (unlinked) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId: args.clerkId,
        eventType: "relationship_deleted",
        memoryId: args.memoryIdA,
        payload: JSON.stringify({ unlinkedFrom: args.memoryIdB }),
      });
    }

    return unlinked;
  },
});

export const getRelatedMemoriesInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getRelatedMemories(driver, args.clerkId, args.memoryId);
  },
});

export const getAllRelationshipsInternal = internalAction({
  args: {
    clerkId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await getAllRelationships(driver, args.clerkId, args.limit ?? 500);
  },
});
