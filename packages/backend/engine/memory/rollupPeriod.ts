/**
 * UTC period keys for rollups. Pure: no Convex imports.
 * Day keys are ISO dates ("2026-10-19"); a day window is [startMs, endMs).
 */

const MS_PER_DAY = 86_400_000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The UTC day before the one that holds `nowMs`. */
export function yesterdayDayKey(nowMs: number): string {
  return utcDayKey(nowMs - MS_PER_DAY);
}

export function dayWindow(dayKey: string): { startMs: number; endMs: number } {
  const startMs = DAY_KEY.test(dayKey)
    ? Date.parse(`${dayKey}T00:00:00.000Z`)
    : Number.NaN;
  // round-trip the key so an impossible date (2026-02-30) never passes
  if (Number.isNaN(startMs) || utcDayKey(startMs) !== dayKey) {
    throw new Error(`Invalid day key: ${dayKey}`);
  }
  return { startMs, endMs: startMs + MS_PER_DAY };
}
