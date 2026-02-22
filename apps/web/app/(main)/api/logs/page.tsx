"use client";

import { Skeleton } from "@vmem/ui";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";

type ApiLogItem = FunctionReturnType<typeof api.apiLogs.listMy>["logs"][number];

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function formatDuration(durationMs: number): string {
  return `${Math.round(durationMs)}ms`;
}

export default function ApiLogsPage() {
  const data = useQuery(api.apiLogs.listMy, { limit: 100 });

  if (data === undefined) {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="p-6 rounded-xl border border-border bg-muted/50"
            >
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-9 w-24 rounded mt-3" />
            </div>
          ))}
        </div>

        <div className="border border-border rounded-xl overflow-hidden">
          <div className="border-b border-border bg-muted/50 p-4">
            <div className="flex gap-8">
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 w-20 rounded hidden md:block" />
              <Skeleton className="h-4 w-16 rounded" />
            </div>
          </div>
          {[1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="p-6 border-b border-border last:border-0"
            >
              <div className="flex items-center gap-8">
                <Skeleton className="h-4 w-56 rounded" />
                <Skeleton className="h-6 w-12 rounded" />
                <Skeleton className="h-4 w-16 rounded hidden md:block" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  const summary = data.summary;
  const logs = data.logs;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl border border-border bg-muted/50">
          <p className="text-sm text-muted-foreground uppercase tracking-wider">
            Total Requests
          </p>
          <p className="text-3xl font-semibold mt-2 text-foreground">
            {summary.totalRequests.toLocaleString()}
          </p>
        </div>
        <div className="p-6 rounded-xl border border-border bg-muted/50">
          <p className="text-sm text-muted-foreground uppercase tracking-wider">
            Success Rate
          </p>
          <p className="text-3xl font-semibold mt-2 text-success">
            {summary.successRate.toFixed(1)}%
          </p>
        </div>
        <div className="p-6 rounded-xl border border-border bg-muted/50">
          <p className="text-sm text-muted-foreground uppercase tracking-wider">
            Avg Response
          </p>
          <p className="text-3xl font-semibold mt-2 text-foreground">
            {formatDuration(summary.avgResponseMs)}
          </p>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Endpoint
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                Duration
              </th>
              <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-10 text-sm text-muted-foreground text-center"
                >
                  No API request logs yet.
                </td>
              </tr>
            ) : (
              logs.map((log: ApiLogItem) => (
                <tr
                  key={log.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-6 py-5">
                    <code className="text-sm text-foreground font-mono">
                      {log.endpoint}
                    </code>
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${
                        log.status >= 200 && log.status < 300
                          ? "bg-success/10 text-success"
                          : log.status >= 400
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/10 text-warning"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(log.durationMs)}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-sm text-muted-foreground">
                      {formatRelativeTime(log.timestamp)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
