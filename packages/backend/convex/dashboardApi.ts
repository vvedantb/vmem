import { v } from "convex/values";
import { authAction, requireClerkId, type AuthActionCtx } from "./auth";
import {
  createDashboardStatsAcc,
  finishDashboardStats,
  type DashboardStatsResult,
} from "../engine/memory/dashboardStats";
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
    const acc = createDashboardStatsAcc();
    await foldScopedStats(ctx, clerkId, args.profileId, teamId, acc);
    return finishDashboardStats(acc);
  },
});
