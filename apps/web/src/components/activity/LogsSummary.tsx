"use client";

import type { FunctionReturnType } from "convex/server";
import { IconCoin, IconStack } from "@tabler/icons-react";
import type { api } from "@vmem/backend";
import {
  MetricSummaryCard,
  MetricSummaryCardSkeleton,
} from "@/components/metrics/MetricSummaryCard";
import { RANGE_LABELS, type Range } from "@/lib/url-state/activity";
import {
  formatCostUsd,
  formatTokens,
  hasTrendActivity,
  type AiLogsTrends,
} from "./_aiLogsUtils";

type SummaryData = FunctionReturnType<typeof api.openRouterLogs.summaryMine>;

interface LogsSummaryProps {
  summary: SummaryData | undefined;
  range: Range;
  trends: AiLogsTrends;
}

export function LogsSummary({ summary, range, trends }: LogsSummaryProps) {
  if (summary === undefined) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        <MetricSummaryCardSkeleton count={2} />
      </div>
    );
  }

  const formattedCost = formatCostUsd(summary.totalCostUsd);
  const formattedTokens = formatTokens(summary.totalTokens);

  const hasTrends =
    hasTrendActivity(trends.calls) ||
    hasTrendActivity(trends.costs) ||
    hasTrendActivity(trends.tokens);

  const cards = [
    {
      label: "Total cost",
      value: formattedCost,
      icon: IconCoin,
      trendData: trends.costs,
      strokeClassName: "text-accent",
    },
    {
      label: "Total tokens",
      value: formattedTokens,
      icon: IconStack,
      trendData: trends.tokens,
      strokeClassName: "text-foreground/70",
    },
  ] as const;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
        <div>
          <h2 className="text-sm font-medium text-foreground">Overview</h2>
          <p className="mt-0.5 text-xs text-muted">
            {RANGE_LABELS[range]} · {summary.totalCalls.toLocaleString()} call
            {summary.totalCalls === 1 ? "" : "s"}
            {summary.isApprox
              ? " (approx — based on most recent 5,000 calls)"
              : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {cards.map((card, index) => (
          <MetricSummaryCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            trendData={card.trendData}
            strokeClassName={card.strokeClassName}
            showTrend={hasTrends}
            index={index}
            animate
          />
        ))}
      </div>
    </section>
  );
}
