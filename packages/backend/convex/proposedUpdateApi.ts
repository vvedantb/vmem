import { v } from "convex/values";
import {
  authAction,
  authQuery,
  getUserByClerkId,
  requireClerkId,
} from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { SYSTEMONE_DEFAULT_MODEL } from "../engine/llm/systemOneClient";
import { mergeGroup, supersedeRow } from "./dream";
import { LLM_MODEL } from "./lib/openRouter/shared";
import { userFacingError } from "./lib/userFacingError";
import type { MemoryReadScope } from "../engine/memory/scope";
import { UPDATES_LINK_REASON } from "../engine/memory/supersede";
import { auditLog, ResourceTypes } from "./auditLog";
import { createDreamSkill } from "./skills";
import { saveTranscriptMemory, TRANSCRIPT_SOURCE } from "./transcripts";
import type { ProposedUpdateNode } from "./memoryApi/types";
import {
  getProposedUpdate,
  listPendingProposedUpdates,
  markProposedUpdateResolved,
} from "./proposedUpdateStore";
import { assertAccessibleProfileIfPresent } from "./profiles/accessibleProfile";
import { canAccessProfileForMcpScope } from "./profiles/mcpAccess";
import { runAssertProfileAccessInternal } from "./teams/auth";
import { proposedUpdateKindValidator } from "./validators";
import {
  createMemory,
  findByMemoryId,
  supersedeMemories,
} from "./memoryStore/helpers";

export type ResolveResult = {
  status: "approved" | "rejected";
  materializedMemoryId?: string;
};

// what an approval made: the memory to show, and the dream action (merge or
// update under a dream run) that proposal history can undo
type Approval = {
  materializedMemoryId?: string;
  dreamActionId?: Id<"dreamActions"> | null;
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

/**
 * Merge proposals: the sources the caller left ticked, in proposal order.
 * Omitted means all. The kept memory (`memoryId`) always stays; at least one
 * other source must stay ticked.
 */
function selectedMergeSources(
  proposal: Doc<"proposedUpdates">,
  selected: readonly string[] | undefined,
): string[] {
  if (selected === undefined) return proposal.sourceMemoryIds;
  if (selected.some((id) => !proposal.sourceMemoryIds.includes(id))) {
    userFacingError(
      "selectedSourceMemoryIds must be sourceMemoryIds of this proposal",
    );
  }
  const sources = proposal.sourceMemoryIds.filter(
    (id) => id === proposal.memoryId || selected.includes(id),
  );
  if (!sources.some((id) => id !== proposal.memoryId)) {
    userFacingError("Select at least one memory to merge");
  }
  return sources;
}

// the AI's merged text: proposed text that differs from the kept memory as
// it was when the proposal was made (Jev merges propose the keeper's own text)
function proposalMergedText(
  proposal: Doc<"proposedUpdates">,
): { title: string; content: string } | undefined {
  const before = proposal.memorySnapshot;
  const title = proposal.proposedTitle ?? before?.title;
  if (before === undefined || title === undefined) return undefined;
  return title === before.title && proposal.proposedContent === before.content
    ? undefined
    : { title, content: proposal.proposedContent };
}

// AI-judged merge (one-off cleanup or nightly): merges the selected sources
// into the kept memory under the dream run, so the merge shows in the
// dreaming log and can be undone for 30 days. The kept memory gets the AI's
// merged text when the proposal has one; the merged text stays as the AI
// wrote it when sources are unticked.
async function applyDreamMergeProposal(
  ctx: MutationCtx,
  proposal: Doc<"proposedUpdates">,
  runId: Id<"dreamRuns">,
  selected: readonly string[] | undefined,
): Promise<Approval> {
  const keeper = await findByMemoryId(ctx, proposal.memoryId);
  if (!keeper) return {};
  const loserIds: Id<"memories">[] = [];
  for (const memoryId of selectedMergeSources(proposal, selected)) {
    const doc = await findByMemoryId(ctx, memoryId);
    if (doc && doc._id !== keeper._id) loserIds.push(doc._id);
  }
  const run = await ctx.db.get(runId);
  const merged = proposalMergedText(proposal);
  const dreamActionId = await mergeGroup(ctx, {
    runId,
    keeperId: keeper._id,
    loserIds,
    reason: proposal.reason,
    ai: {
      relation: "duplicate",
      confidence: proposal.confidence ?? 0,
      // the one-off cleanup (trigger "backfill") judges with the chat model
      model: run?.trigger === "backfill" ? LLM_MODEL : SYSTEMONE_DEFAULT_MODEL,
    },
    ...(merged === undefined ? {} : { merged }),
  });
  return { materializedMemoryId: keeper.memoryId, dreamActionId };
}

// AI-judged nightly update: memoryId is the older row, the other source the
// newer one. Approving supersedes the older row under the dream run (undo for
// 30 days); the newer row stays as it is.
async function applyDreamUpdateProposal(
  ctx: MutationCtx,
  proposal: Doc<"proposedUpdates">,
  runId: Id<"dreamRuns">,
): Promise<Approval> {
  const older = await findByMemoryId(ctx, proposal.memoryId);
  const newerId = proposal.sourceMemoryIds.find(
    (id) => id !== proposal.memoryId,
  );
  const newer =
    newerId === undefined ? null : await findByMemoryId(ctx, newerId);
  if (!older || !newer) return {};
  const dreamActionId = await supersedeRow(ctx, {
    runId,
    keeperId: newer._id,
    olderId: older._id,
    reason: proposal.reason,
    ai: {
      relation: "update",
      confidence: proposal.confidence ?? 0,
      model: LLM_MODEL,
    },
  });
  return { materializedMemoryId: newer.memoryId, dreamActionId };
}

// Dream Mode skill draft: approving creates the skill in the proposal's
// scope (the team's skills for a team profile). Its sources stay as they are.
async function applySkillProposal(
  ctx: MutationCtx,
  clerkId: string,
  proposal: Doc<"proposedUpdates">,
): Promise<void> {
  if (proposal.skill === undefined) {
    throw new Error("Skill proposal has no skill");
  }
  const user = await getUserByClerkId(ctx, clerkId);
  if (!user) throw new Error("User not found");
  const profileId =
    proposal.profileId === undefined
      ? null
      : ctx.db.normalizeId("profiles", proposal.profileId);
  const profile = profileId === null ? null : await ctx.db.get(profileId);
  await createDreamSkill(ctx, {
    userId: user._id,
    ...(profile?.teamId === undefined ? {} : { teamId: profile.teamId }),
    ...proposal.skill,
  });
}

// Dream Mode transcript memory: approving saves it under the id the
// proposal promised, with the app it came from as a tag
async function applyTranscriptProposal(
  ctx: MutationCtx,
  proposal: Doc<"proposedUpdates">,
): Promise<string> {
  return await saveTranscriptMemory(ctx, {
    clerkId: proposal.userId,
    ...(proposal.profileId === undefined
      ? {}
      : { profileId: proposal.profileId }),
    memoryId: proposal.memoryId,
    title: proposal.proposedTitle ?? "Transcript memory",
    content: proposal.proposedContent,
    type: proposal.transcript?.type ?? "knowledge",
    confidence: proposal.confidence ?? 0.8,
    appSource: proposal.transcript?.source ?? TRANSCRIPT_SOURCE,
  });
}

async function applyApproval(
  ctx: MutationCtx,
  params: {
    clerkId: string;
    proposal: NonNullable<Awaited<ReturnType<typeof getProposedUpdate>>>;
    winnerMemoryId?: string;
    selectedSourceMemoryIds?: string[];
  },
): Promise<Approval> {
  const { clerkId, proposal, winnerMemoryId, selectedSourceMemoryIds } = params;
  const kind = await profileKind(ctx, proposal.profileId);
  const scope = writeScope(clerkId, proposal.profileId, kind);

  if (proposal.kind === "delete") {
    await supersedeMemories(ctx, {
      scope,
      predecessorIds: [proposal.memoryId],
    });
    return {};
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
        asVersion: true,
      });
      return { materializedMemoryId: winnerMemoryId };
    }
    return {};
  }

  if (proposal.kind === "skill") {
    await applySkillProposal(ctx, clerkId, proposal);
    return {};
  }

  if (proposal.kind === "transcript") {
    return {
      materializedMemoryId: await applyTranscriptProposal(ctx, proposal),
    };
  }

  if (proposal.kind === "merge" && proposal.dreamRunId !== undefined) {
    return await applyDreamMergeProposal(
      ctx,
      proposal,
      proposal.dreamRunId,
      selectedSourceMemoryIds,
    );
  }

  if (proposal.kind === "update" && proposal.dreamRunId !== undefined) {
    return await applyDreamUpdateProposal(ctx, proposal, proposal.dreamRunId);
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
      asVersion: true,
    });
    return { materializedMemoryId: created.id };
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
    predecessorIds:
      proposal.kind === "merge"
        ? selectedMergeSources(proposal, selectedSourceMemoryIds)
        : proposal.sourceMemoryIds,
    successorId: created.id,
    reason: UPDATES_LINK_REASON,
  });
  return { materializedMemoryId: created.id };
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
    // merge proposals only: the sources to merge (default all)
    selectedSourceMemoryIds?: string[];
  },
): Promise<ResolveResult | null> {
  const proposal = await getProposedUpdate(ctx, args.proposalId);
  if (!proposal || proposal.status !== "pending") return null;
  if (!(await callerMayResolve(ctx, args.clerkId, proposal))) return null;
  if (args.selectedSourceMemoryIds !== undefined && proposal.kind !== "merge") {
    userFacingError("selectedSourceMemoryIds is only for merge proposals");
  }

  if (args.action !== "approve") {
    await markProposedUpdateResolved(ctx, args.proposalId, "rejected");
    return { status: "rejected" };
  }

  const approval = await applyApproval(ctx, {
    clerkId: args.clerkId,
    proposal,
    winnerMemoryId: args.winnerMemoryId,
    selectedSourceMemoryIds: args.selectedSourceMemoryIds,
  });
  await markProposedUpdateResolved(
    ctx,
    args.proposalId,
    "approved",
    approval.dreamActionId ?? undefined,
  );
  return {
    status: "approved",
    materializedMemoryId: approval.materializedMemoryId,
  };
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
    selectedSourceMemoryIds: v.optional(v.array(v.string())),
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
    selectedSourceMemoryIds?: string[];
  },
): Promise<ResolveResult | null> {
  const result = await ctx.runMutation(
    internal.proposedUpdateApi.resolveInternal,
    {
      clerkId: args.clerkId,
      proposalId: args.proposalId,
      action: args.action,
      winnerMemoryId: args.winnerMemoryId,
      selectedSourceMemoryIds: args.selectedSourceMemoryIds,
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
    // merge proposals only: the sources left ticked (default all)
    selectedSourceMemoryIds: v.optional(v.array(v.string())),
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
      selectedSourceMemoryIds: args.selectedSourceMemoryIds,
    });
  },
});

// Dreaming page History: resolved proposals of one profile, newest first
const HISTORY_TAKE = 30;

const proposalHistoryRowValidator = v.object({
  proposalId: v.string(),
  kind: proposedUpdateKindValidator,
  status: v.union(v.literal("approved"), v.literal("rejected")),
  title: v.string(),
  reason: v.string(),
  createdAt: v.number(),
  resolvedAt: v.number(),
  // the dream action an approval made, while it can still be undone: null
  // when there is none, it is not the caller's, its log row was purged or
  // a row it hid was deleted
  undo: v.union(
    v.null(),
    v.object({
      actionId: v.id("dreamActions"),
      undoExpiresAt: v.number(),
      undoneAt: v.optional(v.number()),
    }),
  ),
});

function proposalTitle(proposal: Doc<"proposedUpdates">): string {
  return (
    proposal.proposedTitle ??
    proposal.skill?.name ??
    proposal.memorySnapshot?.title ??
    proposal.sourceMemorySnapshots[0]?.title ??
    "Untitled"
  );
}

async function undoOf(
  ctx: QueryCtx,
  userId: Id<"users">,
  actionId: Id<"dreamActions"> | undefined,
) {
  const action = actionId === undefined ? null : await ctx.db.get(actionId);
  if (!action || action.userId !== userId) return null;
  for (const id of action.memoryIds) {
    if ((await ctx.db.get(id)) === null) return null;
  }
  return {
    actionId: action._id,
    undoExpiresAt: action.undoExpiresAt,
    ...(action.undoneAt === undefined ? {} : { undoneAt: action.undoneAt }),
  };
}

export const listResolved = authQuery({
  args: { profileId: v.id("profiles") },
  returns: v.array(proposalHistoryRowValidator),
  handler: async (ctx, args) => {
    await runAssertProfileAccessInternal(ctx, {
      profileId: args.profileId,
      userId: ctx.userId,
    });
    const rows = await ctx.db
      .query("proposedUpdates")
      .withIndex("by_profile_resolved", (q) =>
        q.eq("profileId", args.profileId).gt("resolvedAt", 0),
      )
      .order("desc")
      .take(HISTORY_TAKE);
    const history = [];
    for (const row of rows) {
      if (row.status === "pending" || row.resolvedAt === undefined) continue;
      history.push({
        proposalId: row.proposalId,
        kind: row.kind,
        status: row.status,
        title: proposalTitle(row),
        reason: row.reason,
        createdAt: row.createdAt,
        resolvedAt: row.resolvedAt,
        undo:
          row.status === "approved"
            ? await undoOf(ctx, ctx.userId, row.dreamActionId)
            : null,
      });
    }
    return history;
  },
});
