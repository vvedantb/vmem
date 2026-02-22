import { v } from "convex/values";
import { authQuery } from "./auth";

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 100;
  }

  const normalized = Math.trunc(limit);
  if (normalized < 1) return 1;
  if (normalized > 500) return 500;
  return normalized;
}

export const listMy = authQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);

    const allLogs = await ctx.db
      .query("apiRequestLogs")
      .withIndex("by_user_created", (q) => q.eq("userId", ctx.userId))
      .collect();

    const recentLogs = await ctx.db
      .query("apiRequestLogs")
      .withIndex("by_user_created", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(limit);

    const totalRequests = allLogs.length;
    const successCount = allLogs.filter(
      (log) => log.status >= 200 && log.status < 300,
    ).length;
    const totalDuration = allLogs.reduce((sum, log) => sum + log.durationMs, 0);

    const successRate =
      totalRequests === 0 ? 0 : (successCount / totalRequests) * 100;
    const avgResponseMs =
      totalRequests === 0 ? 0 : totalDuration / totalRequests;

    return {
      summary: {
        totalRequests,
        successRate,
        avgResponseMs,
      },
      logs: recentLogs.map((log) => ({
        id: log._id,
        endpoint: log.endpoint,
        status: log.status,
        durationMs: log.durationMs,
        timestamp: new Date(log.createdAt).toISOString(),
      })),
    };
  },
});
