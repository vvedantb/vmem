"use client";

import type { TablerIcon } from "@tabler/icons-react";
import { IconActivity, IconCircleCheck, IconClock } from "@tabler/icons-react";
import { Card, CardContent, cn } from "@vmem/ui";
import { formatDuration } from "@/lib/formatters";
import { Sparkline } from "@/components/dashboard/Sparkline";
import type { ApiUsageMetrics } from "./_utils";

interface ApiLogsSummaryProps {
  metrics: ApiUsageMetrics;
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  valueClassName,
  trendData,
  strokeClassName,
  fillClassName,
}: {
  label: string;
  value: string;
  icon: TablerIcon;
  valueClassName?: string;
  trendData: number[];
  strokeClassName: string;
  fillClassName: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex min-h-[9.5rem] flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted">{label}</p>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary/60">
            <Icon size={16} className="text-muted" stroke={1.5} />
          </div>
        </div>
        <p
          className={cn(
            "font-instrumentSerif text-3xl leading-none tabular-nums text-foreground",
            valueClassName,
          )}
        >
          {value}
        </p>
        <div className="mt-auto pt-1">
          <Sparkline
            data={trendData}
            strokeClassName={strokeClassName}
            fillClassName={fillClassName}
          />
          <p className="mt-1.5 text-[11px] text-muted">Last 7 days</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiLogsSummary({ metrics }: ApiLogsSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <SummaryCard
        label="Total requests"
        value={metrics.totalRequests.toLocaleString()}
        icon={IconActivity}
        trendData={metrics.trends.requests}
        strokeClassName="text-accent"
        fillClassName="fill-accent/10"
      />
      <SummaryCard
        label="Success rate"
        value={`${metrics.successRate.toFixed(1)}%`}
        icon={IconCircleCheck}
        valueClassName="text-success"
        trendData={metrics.trends.successRates}
        strokeClassName="text-success"
        fillClassName="fill-success/10"
      />
      <SummaryCard
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
