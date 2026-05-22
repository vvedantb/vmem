"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { runStoreFromInstruction } from "./agent/storeFromInstruction";
import { runUpdateFromInstruction } from "./agent/updateFromInstruction";
import { runSummarizeRetrieve } from "./agent/summarizeRetrieve";

export const storeFromInstructionInternal = internalAction({
  args: {
    clerkId: v.string(),
    instruction: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => runStoreFromInstruction(ctx, args),
});

export const updateFromInstructionInternal = internalAction({
  args: {
    clerkId: v.string(),
    instruction: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args) => runUpdateFromInstruction(ctx, args),
});

export const summarizeRetrieveInternal = internalAction({
  args: {
    clerkId: v.string(),
    query: v.string(),
    profileId: v.optional(v.string()),
    memories: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => runSummarizeRetrieve(ctx, args),
});
