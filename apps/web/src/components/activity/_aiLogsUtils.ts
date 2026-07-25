import { formatCompactNumber, formatSameDayOrDateTime } from "@vmem/shared";
import { createSevenDayBuckets } from "@/lib/daily-trends";
import type { AiLogRow } from "./types";
import { FEATURE_LABELS, FEATURES } from "@/lib/url-state/activity";

type AiLogTrendRow = Pick<AiLogRow, "createdAt" | "costUsd" | "totalTokens">;

export interface AiLogsTrends {
  calls: number[];
  costs: number[];
  tokens: number[];
}

// bucket loaded log rows into daily trends for sparklines
export function computeAiLogsTrends(
  rows: readonly AiLogTrendRow[],
): AiLogsTrends {
  const dayBuckets = createSevenDayBuckets(() => ({
    calls: 0,
    costUsd: 0,
    tokens: 0,
  }));
  const { buckets } = dayBuckets;

  for (const row of rows) {
    dayBuckets.addToBucket(row.createdAt, (bucket) => {
      bucket.calls += 1;
      if (typeof row.costUsd === "number") bucket.costUsd += row.costUsd;
      if (typeof row.totalTokens === "number") bucket.tokens += row.totalTokens;
    });
  }

  return {
    calls: buckets.map((bucket) => bucket.calls),
    costs: buckets.map((bucket) => bucket.costUsd),
    tokens: buckets.map((bucket) => bucket.tokens),
  };
}

export function hasTrendActivity(trend: number[]): boolean {
  return trend.some((value) => value > 0);
}

// format a USD amount with the precision OpenRouter quotes (4dp)
export function formatCostUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.0001) return "<$0.0001";
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toLocaleString();
  return formatCompactNumber(tokens);
}

export function formatLogCost(amount: number | undefined): string {
  if (amount === undefined) return "—";
  return formatCostUsd(amount);
}

export function formatLogTime(ts: number): string {
  return formatSameDayOrDateTime(ts);
}

export function featureLabelFor(feature: string): string {
  for (const knownFeature of FEATURES) {
    if (knownFeature === feature) {
      return FEATURE_LABELS[knownFeature];
    }
  }
  return feature;
}

export function formatTokenPair(
  prompt: number | undefined,
  completion: number | undefined,
): string {
  if (prompt === undefined && completion === undefined) return "—";
  const promptCount = prompt ?? 0;
  const completionCount = completion ?? 0;
  return `${promptCount.toLocaleString()}→${completionCount.toLocaleString()}`;
}
