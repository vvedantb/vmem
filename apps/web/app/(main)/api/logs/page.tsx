"use client";

import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { ApiLogsSummary } from "@/components/api-logs/ApiLogsSummary";
import { ApiLogsTable } from "@/components/api-logs/ApiLogsTable";
import { ApiLogsLoadingSkeleton } from "@/components/api-logs/ApiLogsLoadingSkeleton";

export default function ApiLogsPage() {
  const data = useQuery(api.apiLogs.listMy, { limit: 100 });

  if (data === undefined) {
    return <ApiLogsLoadingSkeleton />;
  }

  return (
    <>
      <ApiLogsSummary
        totalRequests={data.summary.totalRequests}
        successRate={data.summary.successRate}
        avgResponseMs={data.summary.avgResponseMs}
      />
      <ApiLogsTable logs={data.logs} />
    </>
  );
}
