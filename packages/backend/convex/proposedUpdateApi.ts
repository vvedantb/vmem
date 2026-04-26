import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";
import { auditLog, ResourceTypes } from "./auditLog";

interface ProposedUpdateNode {
  id: string;
  memoryId: string;
  proposedContent: string;
  reason: string;
  /** "update" rewrites memory.content. "delete" hard-deletes the memory on approve. */
  kind: "update" | "delete";
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  /**
   * Title + content of the target memory at the time of listing. The
   * proposals UI uses this to render the diff (UPDATE) or the
   * to-be-deleted body (DELETE) without needing a separate
   * memory-detail fetch per row.
   */
  memorySnapshot: { title: string; content: string } | null;
}

interface ResolveResult {
  status: string;
  memoryId: string;
  kind: "update" | "delete";
}

export const listProposedUpdates = authAction({
  args: {},
  handler: async (ctx): Promise<ProposedUpdateNode[]> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");
    return await ctx.runAction(
      internal.neo4jActions.proposedUpdates.listProposedUpdatesInternal,
      {
        clerkId,
      },
    );
  },
});

export const resolveProposal = authAction({
  args: {
    proposalId: v.string(),
    action: v.string(),
  },
  handler: async (ctx, args): Promise<ResolveResult | null> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");

    const result: ResolveResult | null = await ctx.runAction(
      internal.neo4jActions.proposedUpdates.resolveProposalInternal,
      {
        clerkId,
        proposalId: args.proposalId,
        action: args.action,
      },
    );

    // Only audit successful resolutions — a null result means the proposal
    // was already gone / wasn't owned by this user, which isn't audit-worthy.
    if (result) {
      const normalized = args.action.toLowerCase();
      const auditAction =
        normalized === "approve" || normalized === "approved"
          ? "proposed_update.approved"
          : normalized === "reject" || normalized === "rejected"
            ? "proposed_update.rejected"
            : `proposed_update.${normalized}`;

      await auditLog.log(ctx, {
        action: auditAction,
        actorId: ctx.userId,
        resourceType: ResourceTypes.PROPOSED_UPDATE,
        resourceId: args.proposalId,
        metadata: {
          memoryId: result.memoryId,
          resolutionAction: normalized,
          status: result.status,
        },
        severity: "info",
      });
    }

    return result;
  },
});
