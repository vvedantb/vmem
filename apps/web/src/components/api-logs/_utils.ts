import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

export type ApiRequestEntry = FunctionReturnType<
  typeof api.auditLog.listMyApiRequestEntries
>[number];

export interface ApiUsageTrends {
  requests: number[];
  successRates: number[];
  avgDurations: number[];
}

export interface ApiUsageMetrics {
  totalRequests: number;
  successRate: number;
  avgResponseMs: number;
  trends: ApiUsageTrends;
}

const TREND_DAY_COUNT = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

// aggregate request volume, success rate, latency, and 7-day trends
export function computeApiUsageMetrics(
  entries: ApiRequestEntry[],
): ApiUsageMetrics {
  let successCount = 0;
  let totalDuration = 0;

  for (const entry of entries) {
    if (isSuccessStatus(entry.status)) successCount += 1;
    totalDuration += entry.durationMs;
  }

  const totalRequests = entries.length;
  const trends = buildDailyTrends(entries);

  return {
    totalRequests,
    successRate: totalRequests === 0 ? 0 : (successCount / totalRequests) * 100,
    avgResponseMs: totalRequests === 0 ? 0 : totalDuration / totalRequests,
    trends,
  };
}

function buildDailyTrends(entries: ApiRequestEntry[]): ApiUsageTrends {
  const todayStart = startOfLocalDay(Date.now());
  const dayStarts = Array.from(
    { length: TREND_DAY_COUNT },
    (_, index) => todayStart - (TREND_DAY_COUNT - 1 - index) * DAY_MS,
  );

  const dayStartToBucketIndex = new Map(
    dayStarts.map((dayStart, index) => [dayStart, index]),
  );

  const buckets = dayStarts.map((dayStart) => ({
    dayStart,
    requests: 0,
    successCount: 0,
    totalDuration: 0,
  }));

  for (const entry of entries) {
    const entryDayStart = startOfLocalDay(entry.originalTimestamp);
    const bucketIndex = dayStartToBucketIndex.get(entryDayStart);
    if (bucketIndex === undefined) continue;

    const bucket = buckets[bucketIndex];
    if (bucket === undefined) continue;

    bucket.requests += 1;
    if (isSuccessStatus(entry.status)) bucket.successCount += 1;
    bucket.totalDuration += entry.durationMs;
  }

  return {
    requests: buckets.map((bucket) => bucket.requests),
    successRates: buckets.map((bucket) =>
      bucket.requests === 0 ? 0 : (bucket.successCount / bucket.requests) * 100,
    ),
    avgDurations: buckets.map((bucket) =>
      bucket.requests === 0 ? 0 : bucket.totalDuration / bucket.requests,
    ),
  };
}

export function hasTrendActivity(trend: number[]): boolean {
  return trend.some((value) => value > 0);
}

export function prepareTableEntries(
  entries: ApiRequestEntry[],
  limit: number,
): ApiRequestEntry[] {
  return [...entries]
    .sort((a, b) => b.originalTimestamp - a.originalTimestamp)
    .slice(0, limit);
}
