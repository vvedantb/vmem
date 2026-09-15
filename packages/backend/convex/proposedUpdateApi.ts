import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import type { ProposedUpdateNode } from "./memoryApi/types";

type ResolveResult = {
  status: "approved" | "rejected";
  materializedMemoryId?: string;
};

export const listProposedUpdates = authAction({
  args: {
    profileId: v.optional(v.string()),
  },
  handler: async (ctx): Promise<ProposedUpdateNode[]> => {
    await requireClerkId(ctx);
    return [];
  },
});

export const resolveProposal = authAction({
  args: {
    proposalId: v.string(),
    action: v.string(),
    winnerMemoryId: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx): Promise<ResolveResult | null> => {
    await requireClerkId(ctx);
    return null;
  },
});
