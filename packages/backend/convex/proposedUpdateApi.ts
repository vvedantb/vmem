"use node";

import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { auditLog, ResourceTypes } from "./auditLog";
import { getDriver } from "../engine/neo4j/driver";
import { getMemory } from "../engine/neo4j/memory/crud";
import {
  listProposedUpdates as listProposedUpdatesEngine,
  resolveProposal as resolveProposalEngine,
  type ResolveResult,
} from "../engine/neo4j/memory/proposals";
import type { ProposedUpdateNode } from "../engine/neo4j/memory/types";
import { postMaterializeEmbedAndEnrich } from "./neo4jActions/_memories/postMaterialize";
import { runWithNeo4jDriver } from "./neo4jActions/_shared/driver";

export const listProposedUpdates = authAction({
  args: {
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ProposedUpdateNode[]> => {
    const clerkId = await requireClerkId(ctx);

    let strictProfile = false;
    if (args.profileId !== undefined) {
      const profile = await ctx.runQuery(
        internal.teams.assertProfileAccessInternal,
        { profileId: args.profileId, userId: ctx.userId },
      );
      strictProfile = profile.teamId !== undefined;
    }

    return await runWithNeo4jDriver(
      {
        clerkId,
        profileId: args.profileId,
        strictProfile,
      },
      ({ driver, userId, profileId, strictProfile: strict }) =>
        listProposedUpdatesEngine(driver, userId, {
          profileId,
          strictProfile: strict === true,
        }),
    );
  },
});

export const resolveProposal = authAction({
  args: {
    proposalId: v.string(),
    action: v.string(),
    // contradiction proposals: memory id to keep
    winnerMemoryId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResolveResult | null> => {
    const clerkId = await requireClerkId(ctx);

    const action =
      args.action === "approve" || args.action === "reject"
        ? args.action
        : "reject";
    const driver = getDriver();
    const result = await resolveProposalEngine(
      driver,
      args.proposalId,
      action,
      args.winnerMemoryId,
    );

    if (result && result.status === "approved" && result.materializedMemoryId) {
      const materializedMemoryId = result.materializedMemoryId;
      try {
        const detail = await getMemory(driver, clerkId, materializedMemoryId);
        if (detail) {
          await postMaterializeEmbedAndEnrich(ctx, driver, {
            clerkId,
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

    if (result) {
      const normalized = args.action.toLowerCase();
      let auditAction: string;
      if (normalized === "approve" || normalized === "approved") {
        auditAction = "proposed_update.approved";
      } else if (normalized === "reject" || normalized === "rejected") {
        auditAction = "proposed_update.rejected";
      } else {
        auditAction = `proposed_update.${normalized}`;
      }

      await auditLog.log(ctx, {
        action: auditAction,
        actorId: ctx.userId,
        resourceType: ResourceTypes.PROPOSED_UPDATE,
        resourceId: args.proposalId,
        metadata: {
          memoryId: result.memoryId,
          resolutionAction: normalized,
          status: result.status,
          materializedMemoryId: result.materializedMemoryId ?? null,
          kind: result.kind,
        },
        severity: "info",
      });

      if (result.materializedMemoryId && result.status === "approved") {
        await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
          clerkId,
          eventType: "dream_synthesis_materialized",
          memoryId: result.materializedMemoryId,
          payload: JSON.stringify({
            kind: result.kind,
            source: "proposal-approve",
            proposalId: args.proposalId,
          }),
        });
      }
    }

    return result;
  },
});
