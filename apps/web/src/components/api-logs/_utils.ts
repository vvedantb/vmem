import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import { createSevenDayBuckets } from "@/lib/daily-trends";

export type ApiRequestEntries = FunctionReturnType<
  typeof api.auditLog.listMyApiRequestEntries
>;

export type ApiRequestEntry = ApiRequestEntries[number];

interface ApiUsageTrends {
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

export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

// aggregate request volume, success rate, latency, and 7-day trends
export function computeApiUsageMetrics(
  entries: ApiRequestEntries,
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

function buildDailyTrends(entries: ApiRequestEntries): ApiUsageTrends {
  const { buckets, addToBucket } = createSevenDayBuckets(() => ({
    requests: 0,
    successCount: 0,
    totalDuration: 0,
  }));

  for (const entry of entries) {
    addToBucket(entry.originalTimestamp, (bucket) => {
      bucket.requests += 1;
      if (isSuccessStatus(entry.status)) bucket.successCount += 1;
      bucket.totalDuration += entry.durationMs;
    });
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
