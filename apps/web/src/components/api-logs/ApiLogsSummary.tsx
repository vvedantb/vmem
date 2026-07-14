"use client";

import type { TablerIcon } from "@tabler/icons-react";
import { IconActivity, IconCircleCheck, IconClock } from "@tabler/icons-react";
import { Card, CardContent, cn } from "@vmem/ui";
import { formatDuration } from "@/lib/formatters";
import { hasTrendActivity, type ApiUsageTrends } from "./_utils";

interface ApiLogsSummaryProps {
  totalRequests: number;
  successRate: number;
  avgResponseMs: number;
  trends: ApiUsageTrends;
}

type MetricVariant = "requests" | "success" | "latency";

const METRIC_VARIANT_CONFIG = new Map<
  MetricVariant,
  {
    label: string;
    icon: TablerIcon;
    valueClassName?: string;
    strokeClassName: string;
    fillClassName: string;
  }
>([
  [
    "requests",
    {
      label: "Total requests",
      icon: IconActivity,
      strokeClassName: "text-accent",
      fillClassName: "fill-accent/10",
    },
  ],
  [
    "success",
    {
      label: "Success rate",
      icon: IconCircleCheck,
      valueClassName: "text-success",
      strokeClassName: "text-success",
      fillClassName: "fill-success/10",
    },
  ],
  [
    "latency",
    {
      label: "Avg response",
      icon: IconClock,
      strokeClassName: "text-muted",
      fillClassName: "fill-foreground/5",
    },
  ],
]);

function Sparkline({
  data,
  variant,
}: {
  data: number[];
  variant: MetricVariant;
}) {
  const styles = METRIC_VARIANT_CONFIG.get(variant);
  if (styles === undefined) return null;

  const { strokeClassName, fillClassName } = styles;

  if (!hasTrendActivity(data)) {
    return (
      <div aria-hidden className="flex h-10 items-end gap-0.5 opacity-40">
        {data.map((_, index) => (
          <span
            key={index}
            className="flex-1 rounded-sm bg-separator/40"
            style={{ height: 4 }}
          />
        ))}
      </div>
    );
  }

  const width = 200;
  const height = 40;
  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${width - padding},${height} L${padding},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-10 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={areaPath} className={fillClassName} />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        className={strokeClassName}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SummaryCard({
  variant,
  value,
  trendData,
}: {
  variant: MetricVariant;
  value: string;
  trendData: number[];
}) {
  const config = METRIC_VARIANT_CONFIG.get(variant);
  if (config === undefined) return null;

  const { label, icon: Icon, valueClassName } = config;

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
          <Sparkline data={trendData} variant={variant} />
          <p className="mt-1.5 text-[11px] text-muted">Last 7 days</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RequestsSummaryCard({
  totalRequests,
  trendData,
}: {
  totalRequests: number;
  trendData: number[];
}) {
  return (
    <SummaryCard
      variant="requests"
      value={totalRequests.toLocaleString()}
      trendData={trendData}
    />
  );
}

function SuccessRateSummaryCard({
  successRate,
  trendData,
}: {
  successRate: number;
  trendData: number[];
}) {
  return (
    <SummaryCard
      variant="success"
      value={`${successRate.toFixed(1)}%`}
      trendData={trendData}
    />
  );
}

function LatencySummaryCard({
  avgResponseMs,
  trendData,
}: {
  avgResponseMs: number;
  trendData: number[];
}) {
  return (
    <SummaryCard
      variant="latency"
      value={formatDuration(avgResponseMs)}
      trendData={trendData}
    />
  );
}

export function ApiLogsSummary({
  totalRequests,
  successRate,
  avgResponseMs,
  trends,
}: ApiLogsSummaryProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <RequestsSummaryCard
        totalRequests={totalRequests}
        trendData={trends.requests}
      />
      <SuccessRateSummaryCard
        successRate={successRate}
        trendData={trends.successRates}
      />
      <LatencySummaryCard
        avgResponseMs={avgResponseMs}
        trendData={trends.avgDurations}
      />
    </div>
  );
}
