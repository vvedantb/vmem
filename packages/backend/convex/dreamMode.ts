import { authAction, requireClerkId } from "./auth";
import { internal } from "./_generated/api";
import { auditLog, ResourceTypes } from "./auditLog";
import type { DreamRunResult } from "./neo4jActions/dreamMode/runProfile";

export const runDreamForUser = authAction({
  args: {},
  handler: async (ctx): Promise<DreamRunResult> => {
    const clerkId = await requireClerkId(ctx);

    const result: DreamRunResult = await ctx.runAction(
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
