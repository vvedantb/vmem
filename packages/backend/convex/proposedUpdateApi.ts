import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { auditLog, ResourceTypes } from "./auditLog";

/**
 * Mirror of the server-side `ProposedUpdateNode` interface. Kept
 * structurally identical so the action handler can pass through without
 * remapping. Synthesis kinds (insight/connection/contradiction/anomaly)
 * are produced by Dream Mode V2; legacy kinds (update/delete) come from
 * V2 fact-extraction.
 */
type ProposedUpdateKind =
  | "update"
  | "delete"
  | "insight"
  | "connection"
  | "contradiction"
  | "anomaly";

interface ProposedUpdateNode {
  id: string;
  memoryId: string;
  proposedContent: string;
  proposedTitle: string | null;
  reason: string;
  kind: ProposedUpdateKind;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  sourceMemoryIds: string[];
  confidence: number | null;
  source: "v2-extraction" | "dream-mode";
  /**
   * Title + content of the target memory at the time of listing. The
   * proposals UI uses this to render the diff (UPDATE) or the
   * to-be-deleted body (DELETE) without needing a separate
   * memory-detail fetch per row.
   */
  memorySnapshot: { title: string; content: string } | null;
  sourceMemorySnapshots: { id: string; title: string; content: string }[];
}

interface ResolveResult {
  status: string;
  memoryId: string;
  kind: ProposedUpdateKind;
  /** Set when approve materialized a NEW memory (synthesis kinds). */
  materializedMemoryId?: string;
}

export const listProposedUpdates = authAction({
  args: {},
  handler: async (ctx): Promise<ProposedUpdateNode[]> => {
    const clerkId = await requireClerkId(ctx);
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
    const clerkId = await requireClerkId(ctx);

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
          materializedMemoryId: result.materializedMemoryId ?? null,
          kind: result.kind,
        },
        severity: "info",
      });

      // Synthesis approve materialized a brand-new memory — emit a
      // memory_created event so the live graph view picks it up alongside
      // the dream_synthesis_materialized event.
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
