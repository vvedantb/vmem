"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { MemoryService } from "../../src/neo4j/memoryService";
import { getDriver } from "../../src/neo4j/driver";
import { generateEmbedding } from "../lib/openRouter";
import { tryUserAndApiKeyByClerkId } from "../lib/envVars";

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
    // and without enrichment (resolveProposal is pure Cypher — has no
    // OpenRouter access). Embed + enrich it here so it ends up
    // searchable, tagged, and linked via RELATES_TO like a regular
    // memory. Without this the materialized memory was a dead-end node
    // with only DERIVED_FROM edges — useless in graph view.
    if (
      result &&
      result.status === "approved" &&
      result.materializedMemoryId &&
      action === "approve"
    ) {
      const materializedMemoryId = result.materializedMemoryId;
      try {
        const detail = await service.getMemory(
          args.clerkId,
          materializedMemoryId,
        );
        if (detail) {
          const auth = await tryUserAndApiKeyByClerkId(
            ctx,
            args.clerkId,
            "OPENROUTER_API_KEY",
          );
          if (auth) {
            // Embed the materialized memory so it shows up in vector
            // search. Best-effort — leave null on failure; backfill can
            // pick it up later.
            try {
              const embedding = await generateEmbedding({
                ctx,
                apiKey: auth.apiKey,
                userId: auth.userId,
                profileId: detail.profileId ?? undefined,
                feature: "proposal-accept",
                text: `${detail.title}\n\n${detail.content}`,
              });
              await service.setEmbeddings([
                { id: materializedMemoryId, embedding },
              ]);
            } catch (e) {
              console.error(
                `[proposedUpdates] embedding for materialized memory ${materializedMemoryId} failed`,
                e,
              );
            }

            // Run the same enrichment pipeline regular memories get —
            // tags, entities, RELATES_TO edges. Scheduled async; the
            // approve mutation returns immediately.
            await ctx.scheduler.runAfter(
              0,
              internal.neo4jActions.enrichment.enrichMemoryInternal,
              {
                clerkId: args.clerkId,
                memoryId: materializedMemoryId,
                title: detail.title,
                content: detail.content,
                profileId: detail.profileId ?? undefined,
              },
            );
          }
        }
      } catch (e) {
        console.error(
          `[proposedUpdates] post-materialize enrichment for ${materializedMemoryId} failed`,
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
