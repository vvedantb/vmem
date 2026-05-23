"use node";

import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import {
  deduplicateBrowsingHistory as svcDeduplicateBrowsingHistory,
  deduplicateMemories as svcDeduplicateMemories,
  diagnoseDuplicates as svcDiagnoseDuplicates,
} from "../../../src/neo4j/memoryService";
import { getDriver } from "../../../src/neo4j/driver";

export const deduplicateMemories = internalAction({
  args: { clerkId: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const deleted = await svcDeduplicateMemories(driver, args.clerkId);
    console.log(
      `deduplicateMemories: merged ${deleted} duplicates for ${args.clerkId}`,
    );
    return { deleted };
  },
});

export const diagnoseDuplicates = internalAction({
  args: { clerkId: v.string(), title: v.string() },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await svcDiagnoseDuplicates(driver, args.clerkId, args.title);
  },
});

export const deduplicateBrowsingHistory = internalAction({
  args: { clerkId: v.string() },
  returns: v.object({ deleted: v.number() }),
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const deleted = await svcDeduplicateBrowsingHistory(driver, args.clerkId);
    console.log(
      `deduplicateBrowsingHistory: merged ${deleted} duplicates for ${args.clerkId}`,
    );
    return { deleted };
  },
});
