"use client";

import { formatDuration } from "@/lib/formatters";

interface ApiLogsSummaryProps {
  totalRequests: number;
  successRate: number;
  avgResponseMs: number;
}

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="p-6 rounded-xl border border-border bg-muted/50">
      <p className="text-sm text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`text-3xl font-semibold mt-2 ${className ?? "text-foreground"}`}
      >
        {value}
      </p>
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
      />
      <SummaryCard
        label="Success Rate"
        value={`${successRate.toFixed(1)}%`}
        className="text-success"
      />
      <SummaryCard label="Avg Response" value={formatDuration(avgResponseMs)} />
    </div>
  );
}
