import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { ApiLogsSummary } from "@/components/api-logs/ApiLogsSummary";
import { ApiLogsTable } from "@/components/api-logs/ApiLogsTable";
import { ApiLogsLoadingSkeleton } from "@/components/api-logs/ApiLogsLoadingSkeleton";
import { computeApiUsageMetrics } from "@/components/api-logs/_utils";

const DISPLAY_LIMIT = 100;

/**
 * Usage panel for `/settings/api` — request volume / success rate /
 * latency for calls third-party apps make against the public API
 * using the user's generated keys.
 */
export function UsagePanel() {
  const entries = useQuery(api.auditLog.listMyApiRequestEntries, {
    limit: 1000,
  });

  const metrics = useMemo(() => {
    if (!entries) return null;
    return computeApiUsageMetrics(entries);
  }, [entries]);

  const logs = useMemo(() => {
    if (!entries) return null;
    return [...entries]
      .sort((a, b) => b.originalTimestamp - a.originalTimestamp)
      .slice(0, DISPLAY_LIMIT)
      .map((entry) => ({
        id: entry._id,
        endpoint: entry.endpoint,
        status: entry.status,
        durationMs: entry.durationMs,
        timestamp: new Date(entry.originalTimestamp).toISOString(),
      }));
  }, [entries]);

  if (!metrics || !logs) return <ApiLogsLoadingSkeleton />;

  return (
    <div className="flex flex-col gap-8">
      <ApiLogsSummary
        totalRequests={metrics.totalRequests}
        successRate={metrics.successRate}
        avgResponseMs={metrics.avgResponseMs}
        trends={metrics.trends}
      />
      <ApiLogsTable logs={logs} totalCount={metrics.totalRequests} />
    </div>
  );
}
