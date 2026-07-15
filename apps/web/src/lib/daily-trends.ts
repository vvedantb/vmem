export const TREND_DAY_COUNT = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getLastSevenDayStarts(now: number): number[] {
  const todayStart = startOfLocalDay(now);
  return Array.from(
    { length: TREND_DAY_COUNT },
    (_, index) => todayStart - (TREND_DAY_COUNT - 1 - index) * DAY_MS,
  );
}

export function createSevenDayBuckets<T>(createEmpty: () => T): {
  buckets: T[];
  addToBucket(timestamp: number, update: (bucket: T) => void): void;
} {
  const dayStarts = getLastSevenDayStarts(Date.now());
  const dayStartToBucketIndex = new Map(
    dayStarts.map((dayStart, index) => [dayStart, index]),
  );
  const buckets = dayStarts.map(() => createEmpty());

  return {
    buckets,
    addToBucket(timestamp: number, update: (bucket: T) => void): void {
      const bucketIndex = dayStartToBucketIndex.get(startOfLocalDay(timestamp));
      if (bucketIndex === undefined) return;

      const bucket = buckets[bucketIndex];
      if (bucket === undefined) return;

      update(bucket);
    },
  };
}
