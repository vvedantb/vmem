import {
  adjacentPeriodKey,
  parseDayKey,
  periodKeyAt,
  periodWindow,
  utcDayKey,
  type PeriodWindow,
  type RollupPeriod,
} from "@vmem/shared";

export const SUMMARY_PERIOD_LABELS: Record<RollupPeriod, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

export interface SummaryPeriodView {
  key: string;
  window: PeriodWindow;
  /** UTC day key that the date picker shows: the period's first day */
  dayKey: string;
  prevDayKey: string;
  /** null when the next period starts in the future */
  nextDayKey: string | null;
}

/**
 * The period that holds the `on` day (a UTC day key from the URL). With no
 * valid day it is the last finished period, the newest one that can have a
 * stored summary.
 */
export function summaryPeriodView(
  period: RollupPeriod,
  on: string | null,
  nowMs: number,
): SummaryPeriodView {
  const anchorMs = on === null ? null : parseDayKey(on);
  const key =
    anchorMs === null
      ? adjacentPeriodKey(period, periodKeyAt(period, nowMs), -1)
      : periodKeyAt(period, anchorMs);
  const window = periodWindow(period, key);
  return {
    key,
    window,
    dayKey: utcDayKey(window.startMs),
    // any day inside a period selects it: the last day before this one
    prevDayKey: utcDayKey(window.startMs - 1),
    nextDayKey: window.endMs > nowMs ? null : utcDayKey(window.endMs),
  };
}

function utcDayLabel(ms: number, withYear: boolean): string {
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  });
}

/** Periods are UTC, so labels are UTC too: no off-by-one day in the evening. */
export function summaryPeriodLabel(
  period: RollupPeriod,
  window: PeriodWindow,
): string {
  if (period === "month") {
    return new Date(window.startMs).toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    });
  }
  if (period === "day") return utcDayLabel(window.startMs, true);
  return `${utcDayLabel(window.startMs, false)} – ${utcDayLabel(window.endMs - 1, true)}`;
}
