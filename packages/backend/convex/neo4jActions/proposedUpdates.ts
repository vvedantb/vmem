"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { generateEmbedding } from "../../src/neo4j/embeddingService";
import { tryUserEnvVarByClerkId } from "../lib/envVars";

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
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    const action =
      args.action === "approve" || args.action === "reject"
        ? args.action
        : "reject";
    const result = await service.resolveProposal(args.proposalId, action);

    // Synthesis approval materializes a NEW memory without an embedding
    // (resolveProposal is pure Cypher — has no OpenRouter access). Embed
    // it here best-effort; if the user has no API key, leave it null and
    // a future embedding backfill run will pick it up.
    if (
      result &&
      result.status === "approved" &&
      result.materializedMemoryId &&
      action === "approve"
    ) {
      try {
        const apiKey = await tryUserEnvVarByClerkId(
          ctx,
          args.clerkId,
          "OPENROUTER_API_KEY",
        );
        if (apiKey) {
          const detail = await service.getMemory(
            args.clerkId,
            result.materializedMemoryId,
          );
          if (detail) {
            const embedding = await generateEmbedding(
              apiKey,
              `${detail.title}\n\n${detail.content}`,
            );
            await service.setEmbeddings([
              { id: result.materializedMemoryId, embedding },
            ]);
          }
        }
      } catch (e) {
        console.error(
          `[proposedUpdates] embedding for materialized memory ${result.materializedMemoryId} failed`,
          e,
        );
      }
    }

    return result;
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
