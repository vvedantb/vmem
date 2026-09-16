export const TIMELINE_SPANS = ["day", "week", "month", "year", "all"] as const;
export type TimelineSpan = (typeof TIMELINE_SPANS)[number];

export const TIMELINE_SPAN_LABELS: Record<TimelineSpan, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  year: "Year",
  all: "All",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const TIMELINE_SPAN_MS: Record<Exclude<TimelineSpan, "all">, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  year: 365 * DAY_MS,
};

// a single recent memory would otherwise collapse the scrubber to a point
const MIN_TIMELINE_RANGE_MS = DAY_MS;

export const TIMELINE_SCRUBBER_STEPS = 1000;
export const TIMELINE_DENSITY_BUCKETS = 48;

function parseCreatedAtMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export interface MemoryTimelineRange {
  startMs: number;
  endMs: number;
}

export function memoryTimelineRange(
  createdAts: readonly string[],
  nowMs: number,
): MemoryTimelineRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const iso of createdAts) {
    const ms = parseCreatedAtMs(iso);
    if (ms === null) continue;
    if (ms < min) min = ms;
    if (ms > max) max = ms;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const endMs = Math.max(max, nowMs);
  const startMs =
    endMs - min < MIN_TIMELINE_RANGE_MS ? endMs - MIN_TIMELINE_RANGE_MS : min;
  return { startMs, endMs };
}

export function clampNumber(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function latestCreatedAtMs(
  createdAts: readonly string[],
): number | null {
  let max = Number.NEGATIVE_INFINITY;
  for (const iso of createdAts) {
    const ms = parseCreatedAtMs(iso);
    if (ms === null) continue;
    if (ms > max) max = ms;
  }
  return Number.isFinite(max) ? max : null;
}

export function defaultPlayheadMs(
  createdAts: readonly string[],
  range: MemoryTimelineRange,
): number {
  const latest = latestCreatedAtMs(createdAts);
  if (latest === null) return range.endMs;
  return clampNumber(latest, range.startMs, range.endMs);
}

export function resolvedPlayheadMs(
  playheadMs: number | null,
  createdAts: readonly string[],
  range: MemoryTimelineRange,
): number {
  if (playheadMs === null) return defaultPlayheadMs(createdAts, range);
  return clampNumber(playheadMs, range.startMs, range.endMs);
}

export function spanDurationMs(span: TimelineSpan, rangeMs: number): number {
  if (span === "all") return Math.max(0, rangeMs);
  return TIMELINE_SPAN_MS[span];
}

export function windowForPlayhead(
  playheadMs: number,
  spanMs: number,
  range: MemoryTimelineRange,
): MemoryTimelineRange {
  const rangeMs = range.endMs - range.startMs;
  if (spanMs >= rangeMs) return { startMs: range.startMs, endMs: range.endMs };
  const endMs = clampNumber(playheadMs, range.startMs, range.endMs);
  const startMs = Math.max(range.startMs, endMs - spanMs);
  return { startMs, endMs };
}

export function progressFromPlayhead(
  playheadMs: number,
  range: MemoryTimelineRange,
): number {
  if (range.endMs <= range.startMs) return 1;
  return clampNumber(
    (playheadMs - range.startMs) / (range.endMs - range.startMs),
    0,
    1,
  );
}

export function playheadFromProgress(
  progress: number,
  range: MemoryTimelineRange,
): number {
  const t = clampNumber(progress, 0, 1);
  return range.startMs + t * (range.endMs - range.startMs);
}

export function itemCreatedInWindow(
  createdAt: string,
  window: MemoryTimelineRange,
): boolean {
  const ms = parseCreatedAtMs(createdAt);
  if (ms === null) return false;
  return ms >= window.startMs && ms <= window.endMs;
}

export function densityBuckets(
  createdAts: readonly string[],
  range: MemoryTimelineRange,
  bucketCount: number,
): number[] {
  const count = Math.max(0, Math.floor(bucketCount));
  const buckets = Array.from({ length: count }, () => 0);
  if (count === 0 || range.endMs <= range.startMs) return buckets;

  const width = (range.endMs - range.startMs) / count;
  for (const iso of createdAts) {
    const ms = parseCreatedAtMs(iso);
    if (ms === null || ms < range.startMs || ms > range.endMs) continue;
    let index = Math.floor((ms - range.startMs) / width);
    if (index >= count) index = count - 1;
    if (index < 0) index = 0;
    const current = buckets[index];
    if (current === undefined) continue;
    buckets[index] = current + 1;
  }
  return buckets;
}

export function windowCountLabel(total: number, memoryCount: number): string {
  if (total === 0) return "No items in this window";
  if (memoryCount === total) {
    return total === 1 ? "1 memory" : `${total} memories`;
  }
  return total === 1 ? "1 item" : `${total} items`;
}
