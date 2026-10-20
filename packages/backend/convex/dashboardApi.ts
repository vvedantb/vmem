import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { authAction, requireClerkId } from "./auth";
import {
  createDashboardStatsAcc,
  finishDashboardStats,
  type DashboardStatsResult,
} from "../engine/memory/dashboardStats";
import type { MemoryReadScope } from "../engine/memory/scope";
import { foldScopedMemoryStats } from "./memoryStore/walk";
import { resolveAccessibleTeamScope } from "./profiles/accessibleProfile";

// Live counters first, else one scope walk. Callers resolve and check the
// scope; shared by the dashboard and the MCP memory_stats tool.
export async function memoryStatsForScope(
  ctx: Pick<ActionCtx, "runQuery">,
  scope: MemoryReadScope,
): Promise<DashboardStatsResult> {
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
  await foldScopedMemoryStats(ctx, scope, acc);
  return finishDashboardStats(acc);
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
    return await memoryStatsForScope(ctx, scope);
  },
});
