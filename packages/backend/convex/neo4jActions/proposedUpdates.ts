"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { getMemory } from "../../engine/neo4j/memory/crud";
import {
  createProposedDelete,
  createProposedUpdate,
  listProposedUpdates,
  resolveProposal,
} from "../../engine/neo4j/memory/proposals";
import { getDriver } from "../../engine/neo4j/driver";
import { postMaterializeEmbedAndEnrich } from "./_memories/postMaterialize";

export const listProposedUpdatesInternal = internalAction({
  args: { clerkId: v.string() },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await listProposedUpdates(driver, args.clerkId);
  },
});

export const resolveProposalInternal = internalAction({
  args: {
    clerkId: v.string(),
    proposalId: v.string(),
    action: v.string(),
    /** Contradiction resolution: the source memory the user chose to
     *  keep. Losers get suppressed; see `applyContradictionResolution`. */
    winnerMemoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const driver = getDriver();
    const action =
      args.action === "approve" || args.action === "reject"
        ? args.action
        : "reject";
    const result = await resolveProposal(
      driver,
      args.proposalId,
      action,
      args.winnerMemoryId,
    );

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
        const detail = await getMemory(
          driver,
          args.clerkId,
          materializedMemoryId,
        );
        if (detail) {
          await postMaterializeEmbedAndEnrich(ctx, driver, {
            clerkId: args.clerkId,
            memoryId: materializedMemoryId,
            title: detail.title,
            content: detail.content,
            profileId: detail.profileId ?? undefined,
            feature: "proposal-accept",
            failureLog: `[proposedUpdates] embedding for materialized memory ${materializedMemoryId} failed`,
          });
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
 * ADD/UPDATE/DELETE proposal in Neo4j. Wraps Neo4j proposal/crud calls; the
 * caller (`factExtraction.ts`) is responsible for the LLM decision.
 */
export const createProposedUpdateInternal = internalAction({
  args: {
    memoryId: v.string(),
    proposedContent: v.string(),
    reason: v.string(),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    return await createProposedUpdate(driver, {
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
    const driver = getDriver();
    return await createProposedDelete(driver, {
      memoryId: args.memoryId,
      reason: args.reason,
    });
  },
});
