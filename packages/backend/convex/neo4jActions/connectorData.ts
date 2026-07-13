"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { deleteMemoriesBySourceTypes } from "../../engine/neo4j/memory/crud";
import { getDriver } from "../../engine/neo4j/driver";
import { scheduleContextPromptInvalidationByClerkId } from "../lib/contextPromptInvalidate";

export const deleteBySourceTypesInternal = internalAction({
  args: {
    clerkId: v.string(),
    sourceTypes: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const deleted = await deleteMemoriesBySourceTypes(
      getDriver(),
      args.clerkId,
      args.sourceTypes,
    );
    if (deleted > 0) {
      await scheduleContextPromptInvalidationByClerkId(ctx, args.clerkId);
    }
    return deleted;
  },
});
