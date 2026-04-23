import { v } from "convex/values";
import { authQuery } from "./auth";
import { auditLog } from "./auditLog";

/**
 * Adapter over the audit-log component. Preserves the public query shape
 * (`summary` + `logs`) consumed by `apps/web/src/routes/_main/settings/usage.tsx`
 * and `apps/web/src/components/api-logs/ApiLogsTable.tsx` so the web surface
 * didn't need to change when the underlying `apiRequestLogs` table was
 * replaced by the audit log.
 *
 * The audit-log client returns entries typed as `any` — we rely on the Convex
 * runtime validator (`returns:` below) to enforce the output shape.
 */

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
  returns: v.object({
    summary: v.object({
      totalRequests: v.number(),
      successRate: v.number(),
      avgResponseMs: v.number(),
    }),
    logs: v.array(
      v.object({
        id: v.string(),
        endpoint: v.string(),
        status: v.number(),
        durationMs: v.number(),
        timestamp: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const limit = clampLimit(args.limit);

    // Pull everything tagged as an api_request for this actor. We compute the
    // summary from the same set so counts + success rate + avg duration stay
    // in sync with the rendered rows. Capped at 1000 to stay within the
    // audit-log query's internal limit budget and to bound frontend memory.
    const entries = await auditLog.queryByActor(ctx, {
      actorId: ctx.userId,
      actions: ["api_request"],
      limit: 1000,
    });

    let totalRequests = 0;
    let successCount = 0;
    let totalDuration = 0;

    const shapedLogs: {
      id: string;
      endpoint: string;
      status: number;
      durationMs: number;
      timestamp: string;
      sortKey: number;
    }[] = [];

    for (const entry of entries) {
      const meta = entry.metadata;
      if (!meta || typeof meta !== "object") continue;

      const status = typeof meta.status === "number" ? meta.status : 0;
      const durationMs =
        typeof meta.durationMs === "number" ? meta.durationMs : 0;
      const endpoint = typeof meta.endpoint === "string" ? meta.endpoint : "";
      const original =
        typeof meta.originalTimestamp === "number"
          ? meta.originalTimestamp
          : typeof entry.timestamp === "number"
            ? entry.timestamp
            : 0;

      totalRequests += 1;
      if (status >= 200 && status < 300) successCount += 1;
      totalDuration += durationMs;

      shapedLogs.push({
        id: entry._id,
        endpoint,
        status,
        durationMs,
        timestamp: new Date(original).toISOString(),
        sortKey: original,
      });
    }

    // `queryByActor` orders desc by timestamp, but we sort defensively on the
    // source event time (originalTimestamp) so backfilled rows interleave
    // correctly with live rows.
    shapedLogs.sort((a, b) => b.sortKey - a.sortKey);

    const recentLogs = shapedLogs.slice(0, limit).map((log) => ({
      id: log.id,
      endpoint: log.endpoint,
      status: log.status,
      durationMs: log.durationMs,
      timestamp: log.timestamp,
    }));

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
      logs: recentLogs,
    };
  },
});
