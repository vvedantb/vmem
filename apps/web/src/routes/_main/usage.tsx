import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { ApiLogsSummary } from "@/components/api-logs/ApiLogsSummary";
import { ApiLogsTable } from "@/components/api-logs/ApiLogsTable";
import { ApiLogsLoadingSkeleton } from "@/components/api-logs/ApiLogsLoadingSkeleton";
import PageContainer from "@/components/PageContainer";

export const Route = createFileRoute("/_main/usage")({
  component: ApiLogsPage,
});

function ApiLogsPage() {
  const data = useQuery(api.apiLogs.listMy, { limit: 100 });

  if (data === undefined) {
    return (
      <PageContainer title="Usage" showTitle>
        <ApiLogsLoadingSkeleton />
      </PageContainer>
    );
  }

  return (
    <PageContainer title="Usage" showTitle>
      <ApiLogsSummary
        totalRequests={data.summary.totalRequests}
        successRate={data.summary.successRate}
        avgResponseMs={data.summary.avgResponseMs}
      />
      <ApiLogsTable logs={data.logs} />
    </PageContainer>
  );
}
