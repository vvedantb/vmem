"use client";

import { formatDuration } from "@/lib/formatters";

interface ApiLogsSummaryProps {
  totalRequests: number;
  successRate: number;
  avgResponseMs: number;
}

const mockRequestsTrend = [120, 145, 132, 168, 155, 190, 178, 210, 195, 230];
const mockSuccessRateTrend = [
  98.2, 97.8, 99.1, 98.5, 99.3, 98.9, 99.5, 99.2, 98.7, 99.4,
];
const mockResponseTimeTrend = [
  142, 135, 158, 128, 145, 132, 120, 138, 125, 118,
];

function Sparkline({
  data,
  color,
  fillColor,
}: {
  data: Array<number>;
  color: string;
  fillColor: string;
}) {
  const width = 200;
  const height = 48;
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
      className="w-full h-12"
      preserveAspectRatio="none"
    >
      <path d={areaPath} fill={fillColor} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
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
  className,
  trendData,
  chartColor,
  chartFillColor,
}: {
  label: string;
  value: string;
  className?: string;
  trendData: Array<number>;
  chartColor: string;
  chartFillColor: string;
}) {
  return (
    <div className="p-8 rounded-xl border border-border bg-muted/50 flex flex-col gap-4">
      <p className="text-sm text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-4xl font-bold ${className ?? "text-foreground"}`}>
        {value}
      </p>
      <div className="mt-auto">
        <Sparkline
          data={trendData}
          color={chartColor}
          fillColor={chartFillColor}
        />
      </div>
    </div>
  );
}

export function ApiLogsSummary({
  totalRequests,
  successRate,
  avgResponseMs,
}: ApiLogsSummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <SummaryCard
        label="Total Requests"
        value={totalRequests.toLocaleString()}
        trendData={mockRequestsTrend}
        chartColor="hsl(var(--primary))"
        chartFillColor="hsl(var(--primary) / 0.1)"
      />
      <SummaryCard
        label="Success Rate"
        value={`${successRate.toFixed(1)}%`}
        className="text-success"
        trendData={mockSuccessRateTrend}
        chartColor="hsl(var(--success))"
        chartFillColor="hsl(var(--success) / 0.1)"
      />
      <SummaryCard
        label="Avg Response"
        value={formatDuration(avgResponseMs)}
        trendData={mockResponseTimeTrend}
        chartColor="hsl(var(--warning, var(--primary)))"
        chartFillColor="hsl(var(--warning, var(--primary)) / 0.1)"
      />
    </div>
  );
}
