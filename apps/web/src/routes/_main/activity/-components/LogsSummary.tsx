"use client";

import type { FunctionReturnType } from "convex/server";
import type { TablerIcon } from "@tabler/icons-react";
import {
  IconActivityHeartbeat,
  IconCircleCheck,
  IconCoin,
  IconStack,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { cn } from "@vmem/ui";
import { api } from "@vmem/backend";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { RANGE_LABELS, type Range } from "../-searchParams";
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

function SummaryCard({
  label,
  value,
  icon: Icon,
  valueClassName,
  trendData,
  strokeClassName,
  fillClassName,
  showSparkline,
  index,
}: {
  label: string;
  value: string;
  icon: TablerIcon;
  valueClassName?: string;
  trendData: number[];
  strokeClassName: string;
  fillClassName: string;
  showSparkline: boolean;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex min-h-[9.5rem] flex-col gap-3 rounded-xl bg-surface-secondary/40 p-5"
    >
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
      {showSparkline ? (
        <div className="mt-auto pt-1">
          <Sparkline
            data={trendData}
            strokeClassName={strokeClassName}
            fillClassName={fillClassName}
          />
          <p className="mt-1.5 text-[11px] text-muted">Last 7 days</p>
        </div>
      ) : (
        <div className="mt-auto" />
      )}
    </motion.div>
  );
}

export function LogsSummary({ summary, range, trends }: LogsSummaryProps) {
  if (summary === undefined) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="flex min-h-[9.5rem] flex-col gap-3 rounded-xl bg-surface-secondary/40 p-5"
          >
            <div className="h-16 animate-pulse rounded-lg bg-surface-secondary/60" />
          </div>
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

  const hasTrends =
    hasTrendActivity(trends.calls) ||
    hasTrendActivity(trends.costs) ||
    hasTrendActivity(trends.tokens);

  const cards: {
    label: string;
    value: string;
    icon: TablerIcon;
    valueClassName?: string;
    trendData: number[];
    strokeClassName: string;
    fillClassName: string;
  }[] = [
    {
      label: "Total cost",
      value: formattedCost,
      icon: IconCoin,
      trendData: trends.costs,
      strokeClassName: "text-accent",
      fillClassName: "fill-accent/10",
    },
    {
      label: "Total tokens",
      value: formattedTokens,
      icon: IconStack,
      trendData: trends.tokens,
      strokeClassName: "text-foreground/70",
      fillClassName: "fill-foreground/10",
    },
    {
      label: "Avg latency",
      value: latency,
      icon: IconActivityHeartbeat,
      trendData: trends.latencies,
      strokeClassName: "text-muted",
      fillClassName: "fill-foreground/5",
    },
    {
      label: "Success rate",
      value: successPercent,
      icon: IconCircleCheck,
      valueClassName: "text-success",
      trendData: trends.successRates,
      strokeClassName: "text-success",
      fillClassName: "fill-success/10",
    },
  ];

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {cards.map((card, index) => (
          <SummaryCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            valueClassName={card.valueClassName}
            trendData={card.trendData}
            strokeClassName={card.strokeClassName}
            fillClassName={card.fillClassName}
            showSparkline={hasTrends}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}
