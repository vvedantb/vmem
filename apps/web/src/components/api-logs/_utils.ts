export interface ApiRequestEntry {
  endpoint: string;
  status: number;
  durationMs: number;
  originalTimestamp: number;
}

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

/** Aggregate request volume, success rate, latency, and 7-day trends. */
export function computeApiUsageMetrics(
  entries: ApiRequestEntry[],
): ApiUsageMetrics {
  let successCount = 0;
  let totalDuration = 0;

  for (const entry of entries) {
    if (entry.status >= 200 && entry.status < 300) successCount += 1;
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
  const dayStarts = Array.from({ length: TREND_DAY_COUNT }, (_, index) => {
    return todayStart - (TREND_DAY_COUNT - 1 - index) * DAY_MS;
  });

  const buckets = dayStarts.map((dayStart) => ({
    dayStart,
    requests: 0,
    successCount: 0,
    totalDuration: 0,
  }));

  for (const entry of entries) {
    const entryDayStart = startOfLocalDay(entry.originalTimestamp);
    const bucketIndex = dayStarts.findIndex(
      (dayStart) => dayStart === entryDayStart,
    );
    if (bucketIndex < 0) continue;

    const bucket = buckets[bucketIndex];
    if (bucket === undefined) continue;

    bucket.requests += 1;
    if (entry.status >= 200 && entry.status < 300) bucket.successCount += 1;
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
