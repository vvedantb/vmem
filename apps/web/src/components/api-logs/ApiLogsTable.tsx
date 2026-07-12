"use client";

import { IconChartBar } from "@tabler/icons-react";
import { Card, CardContent, cn } from "@vmem/ui";
import { formatRelativeTime, formatDuration } from "@/lib/formatters";

interface ApiLogItem {
  id: string;
  endpoint: string;
  status: number;
  durationMs: number;
  timestamp: string;
}

function getStatusClassName(status: number): string {
  if (status >= 200 && status < 300) return "bg-success/10 text-success";
  if (status >= 400) return "bg-danger/10 text-danger";
  return "bg-warning/10 text-warning";
}

interface ApiLogsTableProps {
  logs: ApiLogItem[];
  totalCount: number;
}

function ApiLogsEmptyState() {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <h2 className="shrink-0 px-0.5 text-sm font-medium text-foreground">
        Recent requests
      </h2>
      <Card className="flex min-h-0 flex-1 flex-col shadow-none">
        <CardContent className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-14 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-surface-tertiary/60">
            <IconChartBar size={28} className="text-muted" stroke={1.5} />
          </div>
          <h3 className="mb-1 text-base font-medium text-foreground text-balance">
            No API requests yet
          </h3>
          <p className="max-w-sm text-sm text-muted text-balance">
            Calls made with your API keys will show up here with status,
            latency, and timing.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function ApiLogRow({ log }: { log: ApiLogItem }) {
  return (
    <li className="rounded-lg px-4 py-3 transition-[background-color] hover:bg-surface-tertiary/50">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <code className="min-w-0 break-all font-mono text-sm text-foreground sm:break-normal">
          {log.endpoint}
        </code>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span
            className={cn(
              "inline-flex rounded-lg px-2 py-0.5 text-xs font-medium tabular-nums",
              getStatusClassName(log.status),
            )}
          >
            {log.status}
          </span>
          <span className="text-xs text-muted tabular-nums md:hidden">
            {formatDuration(log.durationMs)}
          </span>
          <span className="hidden text-sm text-muted tabular-nums md:inline">
            {formatDuration(log.durationMs)}
          </span>
          <span className="hidden text-sm text-muted sm:inline">
            {formatRelativeTime(log.timestamp)}
          </span>
        </div>
      </div>
    </li>
  );
}

export function ApiLogsTable({ logs, totalCount }: ApiLogsTableProps) {
  if (logs.length === 0) {
    return <ApiLogsEmptyState />;
  }

  const showingLabel =
    totalCount > logs.length
      ? `Showing ${logs.length} of ${totalCount.toLocaleString()}`
      : `${logs.length.toLocaleString()} request${logs.length === 1 ? "" : "s"}`;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3 px-0.5">
        <h2 className="text-sm font-medium text-foreground">Recent requests</h2>
        <span className="text-xs text-muted tabular-nums">{showingLabel}</span>
      </div>
      <Card className="flex min-h-0 flex-1 flex-col shadow-none">
        <CardContent className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
          <ul className="flex flex-col gap-1">
            {logs.map((log) => (
              <ApiLogRow key={log.id} log={log} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
