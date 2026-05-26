"use client";

import type { TablerIcon } from "@tabler/icons-react";
import { IconActivity, IconCircleCheck, IconClock } from "@tabler/icons-react";
import { cn } from "@vmem/ui";
import { formatDuration } from "@/lib/formatters";
import { hasTrendActivity, type ApiUsageTrends } from "./_utils";

interface ApiLogsSummaryProps {
  totalRequests: number;
  successRate: number;
  avgResponseMs: number;
  trends: ApiUsageTrends;
}

function Sparkline({
  data,
  strokeClassName,
  fillClassName,
}: {
  data: number[];
  strokeClassName: string;
  fillClassName: string;
}) {
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
    <div className="flex min-h-[9.5rem] flex-col gap-3 rounded-lg bg-surface-secondary/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary/60">
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
    </div>
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
      <SummaryCard
        label="Total requests"
        value={totalRequests.toLocaleString()}
        icon={IconActivity}
        trendData={trends.requests}
        strokeClassName="text-accent"
        fillClassName="fill-accent/10"
      />
      <SummaryCard
        label="Success rate"
        value={`${successRate.toFixed(1)}%`}
        icon={IconCircleCheck}
        valueClassName="text-success"
        trendData={trends.successRates}
        strokeClassName="text-success"
        fillClassName="fill-success/10"
      />
      <SummaryCard
        label="Avg response"
        value={formatDuration(avgResponseMs)}
        icon={IconClock}
        trendData={trends.avgDurations}
        strokeClassName="text-muted"
        fillClassName="fill-foreground/5"
      />
    </div>
  );
}
