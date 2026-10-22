/**
 * UTC period keys for rollups. Pure: no Convex imports.
 * Day keys are ISO dates ("2026-10-19"), week keys ISO weeks ("2026-W43",
 * Monday to Sunday), month keys "2026-10". Windows are [startMs, endMs).
 */

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_KEY = /^(\d{4})-W(\d{2})$/;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;

/** Periods built from stored rollup rows, not from raw memories. */
export type SummaryPeriod = "week" | "month";

export interface PeriodWindow {
  startMs: number;
  endMs: number;
}

export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The UTC day before the one that holds `nowMs`. */
export function yesterdayDayKey(nowMs: number): string {
  return utcDayKey(nowMs - MS_PER_DAY);
}

/** The day's UTC start, or null for a malformed or impossible key. */
export function parseDayKey(dayKey: string): number | null {
  const startMs = DAY_KEY.test(dayKey)
    ? Date.parse(`${dayKey}T00:00:00.000Z`)
    : Number.NaN;
  // round-trip the key so an impossible date (2026-02-30) never passes
  return Number.isNaN(startMs) || utcDayKey(startMs) !== dayKey
    ? null
    : startMs;
}

export function dayWindow(dayKey: string): PeriodWindow {
  const startMs = parseDayKey(dayKey);
  if (startMs === null) throw new Error(`Invalid day key: ${dayKey}`);
  return { startMs, endMs: startMs + MS_PER_DAY };
}

// Monday = 0 … Sunday = 6
function isoWeekday(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

function isoWeekKeyAt(ms: number): string {
  // the iso year is the year of the week's Thursday
  const thursday = ms - isoWeekday(ms) * MS_PER_DAY + 3 * MS_PER_DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / MS_PER_WEEK) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function isoWeekKey(dayKey: string): string {
  return isoWeekKeyAt(dayWindow(dayKey).startMs);
}

export function weekWindow(weekKey: string): PeriodWindow {
  const match = WEEK_KEY.exec(weekKey);
  if (match) {
    // 4 January is always in week 1
    const jan4 = Date.UTC(Number(match[1]), 0, 4);
    const startMs =
      jan4 -
      isoWeekday(jan4) * MS_PER_DAY +
      (Number(match[2]) - 1) * MS_PER_WEEK;
    // round-trip: W00, W54 and W53 of a 52-week year never pass
    if (isoWeekKeyAt(startMs) === weekKey) {
      return { startMs, endMs: startMs + MS_PER_WEEK };
    }
  }
  throw new Error(`Invalid week key: ${weekKey}`);
}

export function monthWindow(key: string): PeriodWindow {
  const match = MONTH_KEY.exec(key);
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) {
    throw new Error(`Invalid month key: ${key}`);
  }
  const year = Number(match[1]);
  return {
    startMs: Date.UTC(year, month - 1, 1),
    endMs: Date.UTC(year, month, 1),
  };
}

export function summaryPeriodWindow(
  period: SummaryPeriod,
  key: string,
): PeriodWindow {
  return period === "week" ? weekWindow(key) : monthWindow(key);
}

/** Week, then month, that end with `dayKey`. Week first: a month reads it. */
export function periodsClosingAfter(
  dayKey: string,
): { period: SummaryPeriod; periodKey: string }[] {
  const { startMs, endMs } = dayWindow(dayKey);
  const closing: { period: SummaryPeriod; periodKey: string }[] = [];
  if (isoWeekday(startMs) === 6) {
    closing.push({ period: "week", periodKey: isoWeekKey(dayKey) });
  }
  if (utcDayKey(endMs).slice(0, 7) !== dayKey.slice(0, 7)) {
    closing.push({ period: "month", periodKey: dayKey.slice(0, 7) });
  }
  return closing;
}

/**
 * The stored rows a week or month is built from. A week reads its 7 days.
 * A month reads the weeks that lie fully inside it, plus the days of the
 * weeks that cross its start or end. Keys are in time order.
 */
export function summaryPeriodSources(
  period: SummaryPeriod,
  key: string,
): { weekKeys: string[]; dayKeys: string[] } {
  const window = summaryPeriodWindow(period, key);
  const weekKeys: string[] = [];
  const dayKeys: string[] = [];
  for (let ms = window.startMs; ms < window.endMs; ms += MS_PER_DAY) {
    const weekKey = isoWeekKeyAt(ms);
    const week = weekWindow(weekKey);
    const fullWeekInMonth =
      period === "month" &&
      week.startMs >= window.startMs &&
      week.endMs <= window.endMs;
    if (!fullWeekInMonth) dayKeys.push(utcDayKey(ms));
    else if (!weekKeys.includes(weekKey)) weekKeys.push(weekKey);
  }
  return { weekKeys, dayKeys };
}

export const ROLLUP_PERIODS = ["day", "week", "month"] as const;
export type RollupPeriod = (typeof ROLLUP_PERIODS)[number];

/** The key of the period that holds `ms`. */
export function periodKeyAt(period: RollupPeriod, ms: number): string {
  if (period === "day") return utcDayKey(ms);
  if (period === "week") return isoWeekKeyAt(ms);
  return utcDayKey(ms).slice(0, 7);
}

export function periodWindow(period: RollupPeriod, key: string): PeriodWindow {
  return period === "day" ? dayWindow(key) : summaryPeriodWindow(period, key);
}

/** The key of the period just before (-1) or after (1) `key`. */
export function adjacentPeriodKey(
  period: RollupPeriod,
  key: string,
  step: -1 | 1,
): string {
  const window = periodWindow(period, key);
  return periodKeyAt(period, step === 1 ? window.endMs : window.startMs - 1);
}

/** The longest period (a 31-day month), to find rows that overlap a window. */
export const MAX_PERIOD_MS = 31 * MS_PER_DAY;

/**
 * The coarsest period with at least one whole UTC period inside the window:
 * month, then week, then day. Day when nothing fits (a short window).
 */
export function coarsestFittingPeriod(window: PeriodWindow): RollupPeriod {
  // first month that starts at or after the window start
  const start = new Date(window.startMs);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const skip = Date.UTC(year, month, 1) < window.startMs ? 1 : 0;
  if (Date.UTC(year, month + skip + 1, 1) <= window.endMs) return "month";
  const dayStart = Math.ceil(window.startMs / MS_PER_DAY) * MS_PER_DAY;
  const monday = dayStart + ((7 - isoWeekday(dayStart)) % 7) * MS_PER_DAY;
  if (monday + MS_PER_WEEK <= window.endMs) return "week";
  return "day";
}
