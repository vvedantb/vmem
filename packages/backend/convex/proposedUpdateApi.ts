import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { auditLog, ResourceTypes } from "./auditLog";
import type { ProposedUpdateNode } from "../engine/neo4j/memory/types";
import type { ResolveResult } from "../engine/neo4j/memory/proposals";

export const listProposedUpdates = authAction({
  args: {},
  handler: async (ctx): Promise<ProposedUpdateNode[]> => {
    const clerkId = await requireClerkId(ctx);
    return await ctx.runAction(
      internal.neo4jActions.proposedUpdates.listProposedUpdatesInternal,
      { clerkId },
    );
  },
});

export const resolveProposal = authAction({
  args: {
    proposalId: v.string(),
    action: v.string(),
    /** Contradiction proposals: memory id to keep. */
    winnerMemoryId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResolveResult | null> => {
    const clerkId = await requireClerkId(ctx);

    const result: ResolveResult | null = await ctx.runAction(
      internal.neo4jActions.proposedUpdates.resolveProposalInternal,
      {
        clerkId,
        proposalId: args.proposalId,
        action: args.action,
        winnerMemoryId: args.winnerMemoryId,
      },
    );

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
