import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type {
  ProposedUpdateKind,
  ProposedUpdateNode,
  ProposalSource,
} from "./memoryApi/types";

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function toProposedUpdateNode(
  doc: Doc<"proposedUpdates">,
): ProposedUpdateNode {
  return {
    id: doc.proposalId,
    memoryId: doc.memoryId,
    proposedContent: doc.proposedContent,
    proposedTitle: doc.proposedTitle ?? null,
    reason: doc.reason,
    kind: doc.kind,
    status: doc.status,
    createdAt: toIso(doc.createdAt),
    resolvedAt: doc.resolvedAt === undefined ? null : toIso(doc.resolvedAt),
    sourceMemoryIds: doc.sourceMemoryIds,
    confidence: doc.confidence ?? null,
    source: doc.source,
    memorySnapshot: doc.memorySnapshot ?? null,
    sourceMemorySnapshots: doc.sourceMemorySnapshots,
  };
}

async function findByProposalId(
  ctx: QueryCtx | MutationCtx,
  proposalId: string,
): Promise<Doc<"proposedUpdates"> | null> {
  return await ctx.db
    .query("proposedUpdates")
    .withIndex("by_proposal_id", (q) => q.eq("proposalId", proposalId))
    .first();
}

export async function listPendingProposedUpdates(
  ctx: QueryCtx | MutationCtx,
  params: { userId: string; profileId?: string },
): Promise<ProposedUpdateNode[]> {
  const rows =
    params.profileId === undefined
      ? await ctx.db
          .query("proposedUpdates")
          .withIndex("by_user_status", (q) =>
            q.eq("userId", params.userId).eq("status", "pending"),
          )
          .collect()
      : await ctx.db
          .query("proposedUpdates")
          .withIndex("by_profile_status", (q) =>
            q.eq("profileId", params.profileId).eq("status", "pending"),
          )
          .collect();
  rows.sort((a, b) => b.createdAt - a.createdAt);
  return rows.map(toProposedUpdateNode);
}

export async function insertProposedUpdate(
  ctx: MutationCtx,
  params: {
    userId: string;
    profileId?: string;
    memoryId: string;
    proposedContent: string;
    proposedTitle?: string;
    reason: string;
    kind: ProposedUpdateKind;
    sourceMemoryIds: string[];
    confidence?: number;
    source: ProposalSource;
    memorySnapshot?: { title: string; content: string };
    sourceMemorySnapshots: Array<{
      id: string;
      title: string;
      content: string;
    }>;
  },
): Promise<ProposedUpdateNode> {
  const proposalId = crypto.randomUUID();
  const now = Date.now();
  await ctx.db.insert("proposedUpdates", {
    proposalId,
    userId: params.userId,
    ...(params.profileId === undefined ? {} : { profileId: params.profileId }),
    memoryId: params.memoryId,
    proposedContent: params.proposedContent,
    ...(params.proposedTitle === undefined
      ? {}
      : { proposedTitle: params.proposedTitle }),
    reason: params.reason,
    kind: params.kind,
    status: "pending",
    createdAt: now,
    sourceMemoryIds: params.sourceMemoryIds,
    ...(params.confidence === undefined
      ? {}
      : { confidence: params.confidence }),
    source: params.source,
    ...(params.memorySnapshot === undefined
      ? {}
      : { memorySnapshot: params.memorySnapshot }),
    sourceMemorySnapshots: params.sourceMemorySnapshots,
  });
  const created = await findByProposalId(ctx, proposalId);
  if (!created) throw new Error("Failed to create proposed update");
  return toProposedUpdateNode(created);
}

export async function getProposedUpdate(
  ctx: QueryCtx | MutationCtx,
  proposalId: string,
): Promise<Doc<"proposedUpdates"> | null> {
  return findByProposalId(ctx, proposalId);
}

export async function markProposedUpdateResolved(
  ctx: MutationCtx,
  proposalId: string,
  status: "approved" | "rejected",
): Promise<ProposedUpdateNode | null> {
  const doc = await findByProposalId(ctx, proposalId);
  if (!doc) return null;
  await ctx.db.patch(doc._id, { status, resolvedAt: Date.now() });
  const updated = await findByProposalId(ctx, proposalId);
  return updated ? toProposedUpdateNode(updated) : null;
}

function sourceIdsOverlap(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const wanted = new Set(left);
  for (const id of right) {
    if (wanted.has(id)) return true;
  }
  return false;
}

export async function hasOverlappingPendingProposal(
  ctx: QueryCtx | MutationCtx,
  params: { userId: string; profileId?: string; sourceMemoryIds: string[] },
): Promise<boolean> {
  const pending = await listPendingProposedUpdates(ctx, {
    userId: params.userId,
    profileId: params.profileId,
  });
  return pending.some((proposal) =>
    sourceIdsOverlap(proposal.sourceMemoryIds, params.sourceMemoryIds),
  );
}
