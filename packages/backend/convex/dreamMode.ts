import { v } from "convex/values";
import { authAction, requireClerkId } from "./auth";
import { internalAction } from "./_generated/server";
import { auditLog, ResourceTypes } from "./auditLog";

export interface DreamRunResult {
  proposalsCreated: number;
  memoriesMaterialized: number;
  clustersScanned: number;
  reweighted: number;
  reason: "ok" | "no-key" | "no-recent-memories" | "rate-limited";
}

function emptyDreamResult(reason: DreamRunResult["reason"]): DreamRunResult {
  return {
    proposalsCreated: 0,
    memoriesMaterialized: 0,
    clustersScanned: 0,
    reweighted: 0,
    reason,
  };
}

export const runDreamForUser = authAction({
  args: {},
  handler: async (ctx): Promise<DreamRunResult> => {
    await requireClerkId(ctx);
    const result = emptyDreamResult("ok");
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

export const runDreamForUserById = internalAction({
  args: { userId: v.id("users") },
  handler: async (): Promise<DreamRunResult> => emptyDreamResult("ok"),
});

export const runDreamForProfileById = internalAction({
  args: { profileId: v.id("profiles") },
  handler: async (): Promise<DreamRunResult> => emptyDreamResult("ok"),
});
