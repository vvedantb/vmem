"use node";

import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { getDriver } from "../engine/neo4j/driver";
import {
  getRelatedMemories as fetchRelatedMemories,
  linkMemories as linkMemoriesEngine,
  unlinkMemories as unlinkMemoriesEngine,
} from "../engine/neo4j/memory/relationships";
import type { MemoryWithTags } from "../engine/neo4j/memory/types";

type RelatedMemory = { memory: MemoryWithTags; reason: string };

export const linkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const clerkId = await requireClerkId(ctx);
    const linked = await linkMemoriesEngine(
      getDriver(),
      clerkId,
      args.memoryIdA,
      args.memoryIdB,
      args.reason,
    );

    if (linked) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId,
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

export const unlinkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const clerkId = await requireClerkId(ctx);
    const unlinked = await unlinkMemoriesEngine(
      getDriver(),
      clerkId,
      args.memoryIdA,
      args.memoryIdB,
    );

    if (unlinked) {
      await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
        clerkId,
        eventType: "relationship_deleted",
        memoryId: args.memoryIdA,
        payload: JSON.stringify({ unlinkedFrom: args.memoryIdB }),
      });
    }

    return unlinked;
  },
});

export const getRelatedMemories = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx, args): Promise<RelatedMemory[]> => {
    const clerkId = await requireClerkId(ctx);
    return await fetchRelatedMemories(getDriver(), clerkId, args.memoryId);
  },
});
