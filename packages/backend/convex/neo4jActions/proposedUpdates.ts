"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { getMemory } from "../../engine/neo4j/memory/crud";
import {
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

    if (result && result.status === "approved" && result.materializedMemoryId) {
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
