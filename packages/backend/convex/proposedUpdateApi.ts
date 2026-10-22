import { v } from "convex/values";
import { authAction, getUserByClerkId, requireClerkId } from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { SYSTEMONE_DEFAULT_MODEL } from "../engine/llm/systemOneClient";
import { mergeGroup } from "./dream";
import type { MemoryReadScope } from "../engine/memory/scope";
import { UPDATES_LINK_REASON } from "../engine/memory/supersede";
import { auditLog, ResourceTypes } from "./auditLog";
import type { ProposedUpdateNode } from "./memoryApi/types";
import {
  getProposedUpdate,
  listPendingProposedUpdates,
  markProposedUpdateResolved,
} from "./proposedUpdateStore";
import { assertAccessibleProfileIfPresent } from "./profiles/accessibleProfile";
import { canAccessProfileForMcpScope } from "./profiles/mcpAccess";
import {
  createMemory,
  findByMemoryId,
  supersedeMemories,
} from "./memoryStore/helpers";

export type ResolveResult = {
  status: "approved" | "rejected";
  materializedMemoryId?: string;
};

function writeScope(
  clerkId: string,
  profileId: string | undefined,
  kind: "personal" | "team",
): MemoryReadScope {
  if (kind === "team" && profileId !== undefined) {
    return { kind: "team", profileId };
  }
  return { kind: "personal", userId: clerkId, profileId };
}

async function profileKind(
  ctx: MutationCtx,
  profileId: string | undefined,
): Promise<"personal" | "team"> {
  if (profileId === undefined) return "personal";
  const id = ctx.db.normalizeId("profiles", profileId);
  if (!id) return "personal";
  const profile = await ctx.db.get(id);
  return profile?.teamId === undefined ? "personal" : "team";
}

// AI-judged cleanup merge: suppress the duplicates under the dream run, so
// the merge shows in the dreaming log and can be undone for 30 days
async function applyDreamMergeProposal(
  ctx: MutationCtx,
  proposal: Doc<"proposedUpdates">,
  runId: Id<"dreamRuns">,
): Promise<string | undefined> {
  const keeper = await findByMemoryId(ctx, proposal.memoryId);
  if (!keeper) return undefined;
  const loserIds: Id<"memories">[] = [];
  for (const memoryId of proposal.sourceMemoryIds) {
    const doc = await findByMemoryId(ctx, memoryId);
    if (doc && doc._id !== keeper._id) loserIds.push(doc._id);
  }
  await mergeGroup(ctx, {
    runId,
    keeperId: keeper._id,
    loserIds,
    reason: proposal.reason,
    ai: {
      relation: "duplicate",
      confidence: proposal.confidence ?? 0,
      model: SYSTEMONE_DEFAULT_MODEL,
    },
  });
  return keeper.memoryId;
}

async function applyApproval(
  ctx: MutationCtx,
  params: {
    clerkId: string;
    proposal: NonNullable<Awaited<ReturnType<typeof getProposedUpdate>>>;
    winnerMemoryId?: string;
  },
): Promise<string | undefined> {
  const { clerkId, proposal, winnerMemoryId } = params;
  const kind = await profileKind(ctx, proposal.profileId);
  const scope = writeScope(clerkId, proposal.profileId, kind);

  if (proposal.kind === "delete") {
    await supersedeMemories(ctx, {
      scope,
      predecessorIds: [proposal.memoryId],
    });
    return undefined;
  }

  if (proposal.kind === "contradiction") {
    if (winnerMemoryId !== undefined) {
      const losers = proposal.sourceMemoryIds.filter(
        (id) => id !== winnerMemoryId,
      );
      await supersedeMemories(ctx, {
        scope,
        predecessorIds: losers,
        successorId: winnerMemoryId,
        reason: UPDATES_LINK_REASON,
      });
      return winnerMemoryId;
    }
    return undefined;
  }

  if (proposal.kind === "merge" && proposal.dreamRunId !== undefined) {
    return await applyDreamMergeProposal(ctx, proposal, proposal.dreamRunId);
  }

  if (proposal.kind === "update") {
    const created = await createMemory(ctx, {
      userId: clerkId,
      profileId: proposal.profileId,
      title:
        proposal.proposedTitle ??
        proposal.memorySnapshot?.title ??
        "Updated memory",
      content: proposal.proposedContent,
      type: "knowledge",
      source: "instruction",
      tags: ["instruction"],
      confidence: proposal.confidence ?? 0.9,
      skipHashDedupe: true,
    });
    await supersedeMemories(ctx, {
      scope,
      predecessorIds: [proposal.memoryId, ...proposal.sourceMemoryIds],
      successorId: created.id,
      reason: UPDATES_LINK_REASON,
    });
    return created.id;
  }

  const created = await createMemory(ctx, {
    userId: clerkId,
    profileId: proposal.profileId,
    title: proposal.proposedTitle ?? "Consolidated memory",
    content: proposal.proposedContent,
    type: "knowledge",
    source: "dream-merge",
    tags: ["dream-merge"],
    confidence: proposal.confidence ?? 0.8,
    skipHashDedupe: true,
  });
  await supersedeMemories(ctx, {
    scope,
    predecessorIds: proposal.sourceMemoryIds,
    successorId: created.id,
    reason: UPDATES_LINK_REASON,
  });
  return created.id;
}

// The caller must be able to use the proposal's profile, with the same check
// MCP proposals_resolve gets from its scoped profile: a team profile needs
// team membership; a personal proposal needs its owner (or the profile owner).
async function callerMayResolve(
  ctx: MutationCtx,
  clerkId: string,
  proposal: { userId: string; profileId?: string },
): Promise<boolean> {
  const profileId =
    proposal.profileId === undefined
      ? null
      : ctx.db.normalizeId("profiles", proposal.profileId);
  const profile = profileId === null ? null : await ctx.db.get(profileId);
  if (profile?.teamId === undefined && proposal.userId === clerkId) return true;
  const user = await getUserByClerkId(ctx, clerkId);
  if (!profile || !user) return false;
  return canAccessProfileForMcpScope(
    ctx,
    user._id,
    profile,
    profile.teamId === undefined ? "personal" : "team",
  );
}

export async function resolveProposedUpdate(
  ctx: MutationCtx,
  args: {
    clerkId: string;
    proposalId: string;
    action: string;
    winnerMemoryId?: string;
  },
): Promise<ResolveResult | null> {
  const proposal = await getProposedUpdate(ctx, args.proposalId);
  if (!proposal || proposal.status !== "pending") return null;
  if (!(await callerMayResolve(ctx, args.clerkId, proposal))) return null;

  if (args.action !== "approve") {
    await markProposedUpdateResolved(ctx, args.proposalId, "rejected");
    return { status: "rejected" };
  }

  const materializedMemoryId = await applyApproval(ctx, {
    clerkId: args.clerkId,
    proposal,
    winnerMemoryId: args.winnerMemoryId,
  });
  await markProposedUpdateResolved(ctx, args.proposalId, "approved");
  return { status: "approved", materializedMemoryId };
}

export const listPendingInternal = internalQuery({
  args: {
    userId: v.string(),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ProposedUpdateNode[]> =>
    listPendingProposedUpdates(ctx, args),
});

export const resolveInternal = internalMutation({
  args: {
    clerkId: v.string(),
    proposalId: v.string(),
    action: v.string(),
    winnerMemoryId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResolveResult | null> =>
    resolveProposedUpdate(ctx, args),
});

export const listProposedUpdates = authAction({
  args: {
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ProposedUpdateNode[]> => {
    const clerkId = await requireClerkId(ctx);
    await assertAccessibleProfileIfPresent(ctx, args.profileId);
    return await ctx.runQuery(internal.proposedUpdateApi.listPendingInternal, {
      userId: clerkId,
      profileId: args.profileId,
    });
  },
});

// Resolve plus the audit entry, shared by the inbox and the MCP
// proposals_resolve tool. Callers check the proposal is in their scope.
export async function resolveProposalWithAudit(
  ctx: ActionCtx,
  args: {
    clerkId: string;
    actorUserId: Id<"users">;
    proposalId: string;
    action: string;
    winnerMemoryId?: string;
  },
): Promise<ResolveResult | null> {
  const result = await ctx.runMutation(
    internal.proposedUpdateApi.resolveInternal,
    {
      clerkId: args.clerkId,
      proposalId: args.proposalId,
      action: args.action,
      winnerMemoryId: args.winnerMemoryId,
    },
  );
  if (result) {
    await auditLog.log(ctx, {
      action: "proposed_update.resolved",
      actorId: args.actorUserId,
      resourceType: ResourceTypes.PROPOSED_UPDATE,
      resourceId: args.proposalId,
      metadata: {
        status: result.status,
        materializedMemoryId: result.materializedMemoryId ?? null,
      },
      severity: "info",
    });
  }
  return result;
}

export const resolveProposal = authAction({
  args: {
    proposalId: v.string(),
    action: v.string(),
    winnerMemoryId: v.optional(v.string()),
    profileId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ResolveResult | null> => {
    const clerkId = await requireClerkId(ctx);
    await assertAccessibleProfileIfPresent(ctx, args.profileId);
    return await resolveProposalWithAudit(ctx, {
      clerkId,
      actorUserId: ctx.userId,
      proposalId: args.proposalId,
      action: args.action,
      winnerMemoryId: args.winnerMemoryId,
    });
  },
});
