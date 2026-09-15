import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import type { MemoryWithTags } from "./memoryApi/types";

type RelatedMemory = { memory: MemoryWithTags; reason: string };

export const linkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
    reason: v.string(),
  },
  handler: async (ctx): Promise<boolean> => {
    await requireClerkId(ctx);
    return false;
  },
});

export const unlinkMemories = authAction({
  args: {
    memoryIdA: v.string(),
    memoryIdB: v.string(),
  },
  handler: async (ctx): Promise<boolean> => {
    await requireClerkId(ctx);
    return false;
  },
});

export const getRelatedMemories = authAction({
  args: { memoryId: v.string() },
  handler: async (ctx): Promise<RelatedMemory[]> => {
    await requireClerkId(ctx);
    return [];
  },
});
