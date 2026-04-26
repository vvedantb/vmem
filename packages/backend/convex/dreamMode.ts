import { v } from "convex/values";
import { authAction } from "./auth";
import { internal } from "./_generated/api";
import { auditLog, ResourceTypes } from "./auditLog";

/**
 * Dream Mode V2 — public API for the manual "Run Dream Mode" button on
 * `/proposals`. The actual Dreamer pipeline lives in
 * `neo4jActions/dreamMode.ts` (Node runtime — needs Neo4j driver). This
 * file is the thin authAction wrapper that resolves clerkId, validates
 * profile ownership, and enforces the 1-run-per-hour rate-limit.
 */

interface RunResult {
  proposalsCreated: number;
  memoriesMaterialized: number;
  clustersScanned: number;
  reason: "ok" | "no-key" | "no-recent-memories" | "rate-limited";
}

export const runDreamForProfile = authAction({
  args: {
    profileId: v.id("profiles"),
  },
  handler: async (ctx, args): Promise<RunResult> => {
    const clerkId: string | null = await ctx.runQuery(
      internal.auth.getClerkIdInternal,
      { userId: ctx.userId },
    );
    if (!clerkId) throw new Error("User not found");

    // Validate the caller actually owns / belongs to this profile.
    const profile = await ctx.runQuery(internal.profiles.getByIdInternal, {
      profileId: args.profileId,
    });
    if (!profile) throw new Error("Profile not found");
    if (profile.userId !== ctx.userId) {
      // Team-profile membership check kept simple for V1: only personal
      // profile owners can trigger manually. Teams can use the daily cron.
      throw new Error("Profile not accessible");
    }

    const result: RunResult = await ctx.runAction(
      internal.neo4jActions.dreamMode.runDreamForActiveProfile,
      {
        clerkId,
        profileId: args.profileId,
      },
    );

    await auditLog.log(ctx, {
      action: "dream_mode.manual_run",
      actorId: ctx.userId,
      resourceType: ResourceTypes.PROFILE,
      resourceId: args.profileId,
      metadata: {
        reason: result.reason,
        proposalsCreated: result.proposalsCreated,
        memoriesMaterialized: result.memoriesMaterialized,
        clustersScanned: result.clustersScanned,
      },
      severity: "info",
    });

    return result;
  },
});
