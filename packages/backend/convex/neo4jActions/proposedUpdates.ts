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

/**
 * Internal helper used by the V2 fact-extraction pipeline to record an
 * ADD/UPDATE/DELETE proposal in Neo4j. Wraps `MemoryService` calls; the
 * caller (`factExtraction.ts`) is responsible for the LLM decision.
 */
export const createProposedUpdateInternal = internalAction({
  args: {
    memoryId: v.string(),
    proposedContent: v.string(),
    reason: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.createProposedUpdate({
      memoryId: args.memoryId,
      proposedContent: args.proposedContent,
      reason: args.reason,
    });
  },
});

export const createProposedDeleteInternal = internalAction({
  args: {
    memoryId: v.string(),
    reason: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new MemoryService(getDriver());
    return await service.createProposedDelete({
      memoryId: args.memoryId,
      reason: args.reason,
    });
  },
});
