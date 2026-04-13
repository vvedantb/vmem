import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";

interface ProposedUpdateNode {
  id: string;
  memoryId: string;
  proposedContent: string;
  reason: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

interface ResolveResult {
  status: string;
  memoryId: string;
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
    return await ctx.runAction(
      internal.neo4jActions.proposedUpdates.resolveProposalInternal,
      {
        clerkId,
        proposalId: args.proposalId,
        action: args.action,
      },
    );
  },
});
