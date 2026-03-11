"use client";

import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { formatRelativeTime, formatDuration } from "@/lib/formatters";

type ApiLogItem = FunctionReturnType<typeof api.apiLogs.listMy>["logs"][number];

function getStatusClassName(status: number): string {
  if (status >= 200 && status < 300) return "bg-success/10 text-success";
  if (status >= 400) return "bg-destructive/10 text-destructive";
  return "bg-warning/10 text-warning";
}

interface ApiLogsTableProps {
  logs: ApiLogItem[];
}

export function ApiLogsTable({ logs }: ApiLogsTableProps) {
  return (
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
              <tr key={log.id} className="border-b border-border last:border-0">
                <td className="px-6 py-5">
                  <code className="text-sm text-foreground font-mono">
                    {log.endpoint}
                  </code>
                </td>
                <td className="px-6 py-5">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-medium ${getStatusClassName(log.status)}`}
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
  );
}
