import { describe, expect, it } from "vitest";
import {
  isoWeekKey,
  monthWindow,
  periodsClosingAfter,
  summaryPeriodSources,
  utcDayKey,
  weekWindow,
} from "../../engine/memory/rollupPeriod";

const MS_PER_DAY = 86_400_000;
const at = (dayKey: string) => Date.parse(`${dayKey}T00:00:00Z`);

describe("isoWeekKey", () => {
  it.each([
    ["2026-10-19", "2026-W43"], // Monday
    ["2026-10-25", "2026-W43"], // Sunday
    ["2025-12-28", "2025-W52"],
    ["2025-12-29", "2026-W01"], // week 1 starts in the year before
    ["2026-01-01", "2026-W01"],
    ["2026-12-28", "2026-W53"], // 2026 starts on a Thursday: 53 weeks
    ["2026-12-31", "2026-W53"],
    ["2027-01-03", "2026-W53"], // week 53 ends in the next year
    ["2027-01-04", "2027-W01"],
    ["2021-01-01", "2020-W53"], // leap year starting on a Wednesday
    ["2024-12-30", "2025-W01"],
  ])("%s is in %s", (dayKey, weekKey) => {
    expect(isoWeekKey(dayKey)).toBe(weekKey);
  });
});

describe("weekWindow", () => {
  it.each([
    ["2026-W43", "2026-10-19", "2026-10-26"],
    ["2026-W01", "2025-12-29", "2026-01-05"],
    ["2026-W53", "2026-12-28", "2027-01-04"],
    ["2027-W01", "2027-01-04", "2027-01-11"],
  ])("%s is [%s, %s)", (weekKey, start, end) => {
    expect(weekWindow(weekKey)).toEqual({ startMs: at(start), endMs: at(end) });
  });

  it.each(["2027-W53", "2026-W00", "2026-W54", "2026-W1", "2026-43"])(
    "rejects %s",
    (weekKey) => {
      expect(() => weekWindow(weekKey)).toThrow("Invalid week key");
    },
  );
});

describe("monthWindow", () => {
  it.each([
    ["2026-02", 28],
    ["2028-02", 29],
    ["2026-04", 30],
    ["2026-10", 31],
    ["2026-12", 31],
  ])("%s has %i days", (key, days) => {
    const { startMs, endMs } = monthWindow(key);
    expect(utcDayKey(startMs)).toBe(`${key}-01`);
    expect((endMs - startMs) / MS_PER_DAY).toBe(days);
  });

  it("ends December at the next year's start", () => {
    expect(monthWindow("2026-12").endMs).toBe(at("2027-01-01"));
  });

  it.each(["2026-00", "2026-13", "2026-1", "2026-W43"])("rejects %s", (key) => {
    expect(() => monthWindow(key)).toThrow("Invalid month key");
  });
});

describe("periodsClosingAfter", () => {
  it.each([
    ["2026-10-19", []], // Monday
    ["2026-10-25", [{ period: "week", periodKey: "2026-W43" }]], // Sunday
    ["2026-10-31", [{ period: "month", periodKey: "2026-10" }]], // Saturday
    ["2026-04-30", [{ period: "month", periodKey: "2026-04" }]], // 30 days
    ["2026-02-28", [{ period: "month", periodKey: "2026-02" }]], // 28 days
    ["2028-02-28", []],
    ["2028-02-29", [{ period: "month", periodKey: "2028-02" }]], // leap
    // Sunday that is also a month end: week first, the month reads it
    [
      "2026-05-31",
      [
        { period: "week", periodKey: "2026-W22" },
        { period: "month", periodKey: "2026-05" },
      ],
    ],
    ["2026-12-31", [{ period: "month", periodKey: "2026-12" }]],
    ["2027-01-03", [{ period: "week", periodKey: "2026-W53" }]],
  ])("after %s", (dayKey, closing) => {
    expect(periodsClosingAfter(dayKey)).toEqual(closing);
  });
});

describe("summaryPeriodSources", () => {
  it("reads the 7 days of a week", () => {
    expect(summaryPeriodSources("week", "2026-W53")).toEqual({
      weekKeys: [],
      dayKeys: [
        "2026-12-28",
        "2026-12-29",
        "2026-12-30",
        "2026-12-31",
        "2027-01-01",
        "2027-01-02",
        "2027-01-03",
      ],
    });
  });

  it.each([
    [
      "2026-10",
      ["2026-W41", "2026-W42", "2026-W43"],
      ["01", "02", "03", "04", "26", "27", "28", "29", "30", "31"].map(
        (d) => `2026-10-${d}`,
      ),
    ],
    [
      "2026-02",
      ["2026-W06", "2026-W07", "2026-W08"],
      ["01", "23", "24", "25", "26", "27", "28"].map((d) => `2026-02-${d}`),
    ],
    // W53 crosses into January, so its December days are read one by one
    [
      "2026-12",
      ["2026-W50", "2026-W51", "2026-W52"],
      ["01", "02", "03", "04", "05", "06", "28", "29", "30", "31"].map(
        (d) => `2026-12-${d}`,
      ),
    ],
    [
      "2027-01",
      ["2027-W01", "2027-W02", "2027-W03", "2027-W04"],
      // 25–31 January is a full week (W04), so only 1–3 are days
      ["2027-01-01", "2027-01-02", "2027-01-03"],
    ],
  ])("reads full weeks plus edge days of %s", (key, weekKeys, dayKeys) => {
    const sources = summaryPeriodSources("month", key);
    expect(sources).toEqual({ weekKeys, dayKeys });
    const { startMs, endMs } = monthWindow(key);
    expect(sources.dayKeys.length + 7 * sources.weekKeys.length).toBe(
      (endMs - startMs) / MS_PER_DAY,
    );
  });
});
