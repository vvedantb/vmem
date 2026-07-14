import { FEATURE_LABELS, FEATURES } from "../-searchParams";

const TREND_DAY_COUNT = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiLogTrendRow {
  createdAt: number;
  costUsd?: number;
  totalTokens?: number;
}

export interface AiLogsTrends {
  calls: number[];
  costs: number[];
  tokens: number[];
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Bucket loaded log rows into daily trends for sparklines. */
export function computeAiLogsTrends(
  rows: readonly AiLogTrendRow[],
): AiLogsTrends {
  const todayStart = startOfLocalDay(Date.now());
  const dayStarts = Array.from({ length: TREND_DAY_COUNT }, (_, index) => {
    return todayStart - (TREND_DAY_COUNT - 1 - index) * DAY_MS;
  });

  const buckets = dayStarts.map(() => ({
    calls: 0,
    costUsd: 0,
    tokens: 0,
  }));

  for (const row of rows) {
    const entryDayStart = startOfLocalDay(row.createdAt);
    const bucketIndex = dayStarts.findIndex(
      (dayStart) => dayStart === entryDayStart,
    );
    if (bucketIndex < 0) continue;

    const bucket = buckets.at(bucketIndex);
    if (bucket === undefined) continue;
    bucket.calls += 1;
    if (typeof row.costUsd === "number") bucket.costUsd += row.costUsd;
    if (typeof row.totalTokens === "number") bucket.tokens += row.totalTokens;
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

/** Format a USD amount with the precision OpenRouter quotes (4dp). */
export function formatCostUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.0001) return "<$0.0001";
  if (amount < 1) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toLocaleString();
}

export function formatLogCost(amount: number | undefined): string {
  if (amount === undefined) return "—";
  return formatCostUsd(amount);
}

export function formatLogTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
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
