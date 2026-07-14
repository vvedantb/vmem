import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { auditLog, ResourceTypes } from "./auditLog";

interface RunResult {
  proposalsCreated: number;
  memoriesMaterialized: number;
  clustersScanned: number;
  // memories whose confidence the reconsolidation pass adjusted
  reweighted: number;
  reason: "ok" | "no-key" | "no-recent-memories" | "rate-limited";
}

export const runDreamForUser = authAction({
  args: {},
  handler: async (ctx): Promise<RunResult> => {
    const clerkId = await requireClerkId(ctx);

    const result: RunResult = await ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForActiveUser,
      {
        clerkId,
        userId: ctx.userId,
      },
    );

    await auditLog.log(ctx, {
      action: "dream_mode.manual_run",
      actorId: ctx.userId,
      resourceType: ResourceTypes.USER,
      resourceId: ctx.userId,
      metadata: {
        reason: result.reason,
        proposalsCreated: result.proposalsCreated,
        memoriesMaterialized: result.memoriesMaterialized,
        clustersScanned: result.clustersScanned,
        reweighted: result.reweighted,
      },
      severity: "info",
    });

    return result;
  },
});
