import { describe, expect, it } from "vitest";
import { formatCompactRelativeTime } from "@vvedantb/ui";

/**
 * vmem dropped its local `@vmem/shared` `formatCompactRelativeTime` in favour of
 * the `@vvedantb/ui` one, called as `formatCompactRelativeTime(date, { justNow: "now" })`.
 * These cases reproduce the output the removed local copy gave, so the swap stays
 * behaviour-for-behaviour identical. A fixed `now` keeps the test deterministic.
 */
describe("formatCompactRelativeTime (package, { justNow: 'now' })", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  const format = (ago: number) =>
    formatCompactRelativeTime(now - ago, { justNow: "now", now });

  const cases: ReadonlyArray<[label: string, ago: number, expected: string]> = [
    ["under a minute", 30 * SECOND, "now"],
    ["exactly a minute", MINUTE, "1m"],
    ["minutes", 5 * MINUTE, "5m"],
    ["just under an hour", 59 * MINUTE, "59m"],
    ["hours", 3 * HOUR, "3h"],
    ["just under a day", 23 * HOUR, "23h"],
    ["days", 2 * DAY, "2d"],
    ["just under a month", 29 * DAY, "29d"],
    ["months", 45 * DAY, "1mo"],
    ["just under a year", 11 * 30 * DAY, "11mo"],
    ["years", 400 * DAY, "1y"],
  ];

  it.each(cases)("%s -> %s", (_label, ago, expected) => {
    expect(format(ago)).toBe(expected);
  });

  it("treats a future time as 'now'", () => {
    expect(format(-5 * MINUTE)).toBe("now");
  });
});
