import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { ApiLogsSummary } from "@/components/api-logs/ApiLogsSummary";
import { ApiLogsTable } from "@/components/api-logs/ApiLogsTable";
import { ApiLogsLoadingSkeleton } from "@/components/api-logs/ApiLogsLoadingSkeleton";

// Max rows rendered in the table. Backend caps at 1000; we slice client-side.
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

  // Summary aggregates the full result set so the counts + success rate +
  // avg duration stay consistent with what the backend returned (not just
  // the visible slice).
  const summary = useMemo(() => {
    if (!entries) return null;
    let totalRequests = 0;
    let successCount = 0;
    let totalDuration = 0;
    for (const entry of entries) {
      totalRequests += 1;
      if (entry.status >= 200 && entry.status < 300) successCount += 1;
      totalDuration += entry.durationMs;
    }
    return {
      totalRequests,
      successRate:
        totalRequests === 0 ? 0 : (successCount / totalRequests) * 100,
      avgResponseMs: totalRequests === 0 ? 0 : totalDuration / totalRequests,
    };
  }, [entries]);

  // Sort by the source event time (backfilled rows interleave correctly
  // with live rows), then slice to the display window and format the
  // timestamp once for the renderer.
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

  if (!summary || !logs) return <ApiLogsLoadingSkeleton />;

  return (
    <>
      <ApiLogsSummary
        totalRequests={summary.totalRequests}
        successRate={summary.successRate}
        avgResponseMs={summary.avgResponseMs}
      />
      <ApiLogsTable logs={logs} />
    </>
  );
}
