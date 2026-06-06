"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { deleteMemoriesBySourceTypes } from "../../engine/neo4j/memory/crud";
import { getDriver } from "../../engine/neo4j/driver";
import { scheduleContextPromptInvalidation } from "./_memories/shared";
import type { ActionCtx } from "../_generated/server";

export async function runDeleteConnectorData(
  ctx: ActionCtx,
  args: { clerkId: string; sourceTypes: string[] },
): Promise<number> {
  const driver = getDriver();
  const deleted = await deleteMemoriesBySourceTypes(
    driver,
    args.clerkId,
    args.sourceTypes,
  );
  if (deleted > 0) {
    await scheduleContextPromptInvalidation(ctx, args.clerkId);
  }
  return deleted;
}

export const deleteBySourceTypesInternal = internalAction({
  args: {
    clerkId: v.string(),
    sourceTypes: v.array(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => runDeleteConnectorData(ctx, args),
});
