import { describe, expect, it } from "vitest";
import { summaryPeriodLabel, summaryPeriodView } from "./timeline-summary";

// Thursday 22 October 2026, 15:00 UTC
const NOW = Date.parse("2026-10-22T15:00:00Z");
const at = (dayKey: string) => Date.parse(`${dayKey}T00:00:00Z`);

describe("summaryPeriodView", () => {
  it("defaults to the last finished period", () => {
    expect(summaryPeriodView("day", null, NOW).key).toBe("2026-10-21");
    expect(summaryPeriodView("week", null, NOW).key).toBe("2026-W42");
    expect(summaryPeriodView("month", null, NOW).key).toBe("2026-09");
  });

  it("falls back to the default for an invalid day key", () => {
    expect(summaryPeriodView("day", "2026-02-30", NOW).key).toBe("2026-10-21");
    expect(summaryPeriodView("day", "garbage", NOW).key).toBe("2026-10-21");
  });

  it("selects the period that holds the day", () => {
    const week = summaryPeriodView("week", "2026-10-07", NOW);
    expect(week.key).toBe("2026-W41");
    expect(week.window).toEqual({
      startMs: at("2026-10-05"),
      endMs: at("2026-10-12"),
    });
    expect(week.dayKey).toBe("2026-10-05");
    expect(week.prevDayKey).toBe("2026-10-04");
    expect(week.nextDayKey).toBe("2026-10-12");
  });

  it("steps across month and year edges", () => {
    const month = summaryPeriodView("month", "2026-01-15", NOW);
    expect(month.prevDayKey).toBe("2025-12-31");
    expect(month.nextDayKey).toBe("2026-02-01");
    expect(summaryPeriodView("month", month.prevDayKey, NOW).key).toBe(
      "2025-12",
    );
  });

  it("has no next period once the period reaches now", () => {
    expect(summaryPeriodView("day", "2026-10-22", NOW).nextDayKey).toBeNull();
    expect(summaryPeriodView("week", "2026-10-19", NOW).nextDayKey).toBeNull();
    expect(summaryPeriodView("day", "2026-10-21", NOW).nextDayKey).toBe(
      "2026-10-22",
    );
  });
});

describe("summaryPeriodLabel", () => {
  it("labels UTC periods", () => {
    expect(
      summaryPeriodLabel("day", { startMs: at("2026-10-21"), endMs: 0 }),
    ).toBe("Oct 21, 2026");
    expect(
      summaryPeriodLabel("week", {
        startMs: at("2026-10-19"),
        endMs: at("2026-10-26"),
      }),
    ).toBe("Oct 19 – Oct 25, 2026");
    expect(
      summaryPeriodLabel("month", {
        startMs: at("2026-10-01"),
        endMs: at("2026-11-01"),
      }),
    ).toBe("October 2026");
  });
});
