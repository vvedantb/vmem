"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";

export const listProposedUpdatesInternal = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.listProposedUpdates(args.clerkId);
  },
});

export const resolveProposalInternal = internalAction({
  args: {
    clerkId: v.string(),
    proposalId: v.string(),
    action: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    const action =
      args.action === "approve" || args.action === "reject"
        ? args.action
        : "reject";
    return await service.resolveProposal(args.proposalId, action);
  },
});
