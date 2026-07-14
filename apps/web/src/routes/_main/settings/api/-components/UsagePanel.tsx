import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { ApiLogsSummary } from "@/components/api-logs/ApiLogsSummary";
import { ApiLogsTable } from "@/components/api-logs/ApiLogsTable";
import { ApiLogsLoadingSkeleton } from "@/components/api-logs/ApiLogsLoadingSkeleton";
import { computeApiUsageMetrics } from "@/components/api-logs/_utils";

const DISPLAY_LIMIT = 100;

// usage panel for `/settings/api`
export function UsagePanel() {
  const entries = useQuery(api.auditLog.listMyApiRequestEntries, {
    limit: 1000,
  });

  if (entries === undefined) return <ApiLogsLoadingSkeleton />;

  const metrics = computeApiUsageMetrics(entries);
  const logs = [...entries]
    .sort((a, b) => b.originalTimestamp - a.originalTimestamp)
    .slice(0, DISPLAY_LIMIT);

  return (
    <div className="flex h-full min-h-0 flex-col gap-8">
      <ApiLogsSummary metrics={metrics} />
      <ApiLogsTable logs={logs} totalCount={metrics.totalRequests} />
    </div>
  );
}
