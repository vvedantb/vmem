import { IconActivity, IconCircleCheck, IconClock } from "@tabler/icons-react";
import { formatDuration } from "@/lib/formatters";
import { MetricSummaryCard } from "@/components/metrics/MetricSummaryCard";
import type { ApiUsageMetrics } from "./_utils";

interface ApiLogsSummaryProps {
  metrics: ApiUsageMetrics;
}

export function ApiLogsSummary({ metrics }: ApiLogsSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <MetricSummaryCard
        label="Total requests"
        value={metrics.totalRequests.toLocaleString()}
        icon={IconActivity}
        trendData={metrics.trends.requests}
        strokeClassName="text-accent"
        fillClassName="fill-accent/10"
      />
      <MetricSummaryCard
        label="Success rate"
        value={`${metrics.successRate.toFixed(1)}%`}
        icon={IconCircleCheck}
        valueClassName="text-success"
        trendData={metrics.trends.successRates}
        strokeClassName="text-success"
        fillClassName="fill-success/10"
      />
      <MetricSummaryCard
        label="Avg response"
        value={formatDuration(metrics.avgResponseMs)}
        icon={IconClock}
        trendData={metrics.trends.avgDurations}
        strokeClassName="text-muted"
        fillClassName="fill-foreground/5"
      />
    </div>
  );
}
