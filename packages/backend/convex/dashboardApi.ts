import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authAction, requireClerkId, type AuthActionCtx } from "./auth";
import {
  createDashboardStatsAcc,
  finishDashboardStats,
  type DashboardStatsResult,
} from "../engine/memory/dashboardStats";
import type { MemoryReadScope } from "../engine/memory/scope";
import { foldScopedMemoryStats } from "./memoryStore/walk";
import { resolveAccessibleTeamScope } from "./profiles/accessibleProfile";

async function foldScopedStats(
  ctx: AuthActionCtx,
  clerkId: string,
  profileId: string | undefined,
  teamId: string | undefined,
  acc: ReturnType<typeof createDashboardStatsAcc>,
): Promise<void> {
  if (teamId !== undefined && profileId !== undefined) {
    await foldScopedMemoryStats(ctx, { kind: "team", profileId }, acc);
    return;
  }
  await foldScopedMemoryStats(
    ctx,
    { kind: "personal", userId: clerkId, profileId },
    acc,
  );
}

export const getStats = authAction({
  args: {
    profileId: v.optional(v.string()),
    fresh: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<DashboardStatsResult> => {
    const clerkId = await requireClerkId(ctx);
    const { teamId } = await resolveAccessibleTeamScope(ctx, args.profileId);
    const scope: MemoryReadScope =
      teamId !== undefined && args.profileId !== undefined
        ? { kind: "team", profileId: args.profileId }
        : { kind: "personal", userId: clerkId, profileId: args.profileId };
    const counted = await ctx.runQuery(
      internal.memoryStats.getMemoryStatsInternal,
      {
        kind: scope.kind,
        userId: scope.kind === "personal" ? scope.userId : undefined,
        profileId: scope.profileId ?? undefined,
        now: Date.now(),
      },
    );
    if (counted !== null) return counted;
    const acc = createDashboardStatsAcc();
    await foldScopedStats(ctx, clerkId, args.profileId, teamId, acc);
    return finishDashboardStats(acc);
  },
});
