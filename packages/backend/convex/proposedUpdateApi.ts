import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { MemoryReadScope } from "../engine/memory/scope";
import { UPDATES_LINK_REASON } from "../engine/memory/supersede";
import { auditLog, ResourceTypes } from "./auditLog";
import type { ProposedUpdateNode } from "./memoryApi/types";
import {
  proposedUpdateKindValidator,
  proposedUpdateSourceValidator,
} from "./validators";
import {
  getProposedUpdate,
  insertProposedUpdate,
  listPendingProposedUpdates,
  markProposedUpdateResolved,
} from "./proposedUpdateStore";
import { assertAccessibleProfileIfPresent } from "./profiles/accessibleProfile";
import { createMemory, supersedeMemories } from "./memoryStore/helpers";

type ResolveResult = {
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
  });
  await supersedeMemories(ctx, {
    scope,
    predecessorIds: proposal.sourceMemoryIds,
    successorId: created.id,
    reason: UPDATES_LINK_REASON,
  });
  return created.id;
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
  if (proposal.userId !== args.clerkId) {
    if (proposal.profileId === undefined) return null;
    const profileId = ctx.db.normalizeId("profiles", proposal.profileId);
    if (!profileId) return null;
    const profile = await ctx.db.get(profileId);
    if (!profile) return null;
  }

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

export const insertInternal = internalMutation({
  args: {
    userId: v.string(),
    profileId: v.optional(v.string()),
    memoryId: v.string(),
    proposedContent: v.string(),
    proposedTitle: v.optional(v.string()),
    reason: v.string(),
    kind: proposedUpdateKindValidator,
    sourceMemoryIds: v.array(v.string()),
    confidence: v.optional(v.number()),
    source: proposedUpdateSourceValidator,
    memorySnapshot: v.optional(
      v.object({ title: v.string(), content: v.string() }),
    ),
    sourceMemorySnapshots: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        content: v.string(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<ProposedUpdateNode> =>
    insertProposedUpdate(ctx, args),
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
    const result = await ctx.runMutation(
      internal.proposedUpdateApi.resolveInternal,
      {
        clerkId,
        proposalId: args.proposalId,
        action: args.action,
        winnerMemoryId: args.winnerMemoryId,
      },
    );
    if (result) {
      await auditLog.log(ctx, {
        action: "proposed_update.resolved",
        actorId: ctx.userId,
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
  },
});
