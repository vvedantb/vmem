"use client";

import { useQuery } from "convex/react";
import { Skeleton } from "@vmem/ui";
import { api, type Id } from "@vmem/backend";
import {
  IconCoin,
  IconActivityHeartbeat,
  IconStack,
  IconCircleCheck,
} from "@tabler/icons-react";
import type { Range, Scope } from "../-searchParams";
import { RANGE_LABELS } from "../-searchParams";

/**
 * Four stat cards above the logs table. Mirrors the table's `scope` so the
 * summary always describes the same row population the user is browsing.
 *
 * The summary endpoint caps at 5k rows; when that cap fires it returns
 * `isApprox: true` and we surface a small label so users know totals
 * understate true spend on huge windows.
 */
interface LogsSummaryProps {
  scope: Scope;
  teamId: Id<"teams"> | undefined;
  range: Range;
}

export function LogsSummary({ scope, teamId, range }: LogsSummaryProps) {
  // `useQuery` returns `undefined` while loading, so `summary === undefined`
  // is the loading branch (NOT `summary === null`, which would be returned
  // if the query argued itself out of running).
  const summary = useQuery(
    api.openRouterLogs.summaryMine,
    scope === "team"
      ? teamId
        ? { scope, teamId, range }
        : "skip"
      : { scope, range },
  );

  if (summary === undefined) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const formattedCost = formatCostUsd(summary.totalCostUsd);
  const formattedTokens = formatTokens(summary.totalTokens);
  const successPercent = `${(summary.successRate * 100).toFixed(1)}%`;
  const latency =
    summary.avgLatencyMs > 0
      ? `${summary.avgLatencyMs.toLocaleString()}ms`
      : "—";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total cost"
          value={formattedCost}
          icon={<IconCoin size={18} className="text-muted-foreground" />}
        />
        <StatCard
          label="Total tokens"
          value={formattedTokens}
          icon={<IconStack size={18} className="text-muted-foreground" />}
        />
        <StatCard
          label="Avg latency"
          value={latency}
          icon={
            <IconActivityHeartbeat
              size={18}
              className="text-muted-foreground"
            />
          }
        />
        <StatCard
          label="Success rate"
          value={successPercent}
          icon={<IconCircleCheck size={18} className="text-muted-foreground" />}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {RANGE_LABELS[range]} · {summary.totalCalls.toLocaleString()} call
        {summary.totalCalls === 1 ? "" : "s"}
        {summary.isApprox ? " (approx — based on most recent 5,000 calls)" : ""}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

/** Format a USD amount with the precision OpenRouter quotes (4dp). */
function formatCostUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.0001) return "<$0.0001";
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toLocaleString();
}
