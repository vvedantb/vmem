import { describe, expect, it } from "vitest";
import {
  classifyQueryTemporal,
  inferTemporalFields,
  temporalScore,
} from "../../engine/memory/temporal";
import { parseFactExtractionResponse } from "../../engine/memory/extractFacts";

const NOW = Date.parse("2026-09-17T12:00:00.000Z");

describe("classifyQueryTemporal", () => {
  it("maps last week, currently, and explicit dates without an LLM", () => {
    expect(classifyQueryTemporal("who did I sit with last week", NOW)).toEqual(
      expect.objectContaining({ kind: "window", label: "last week" }),
    );
    expect(
      classifyQueryTemporal("where is headquarters currently", NOW),
    ).toEqual({ kind: "current" });
    const dated = classifyQueryTemporal("what happened on 2026-08-08", NOW);
    expect(dated.kind).toBe("window");
    if (dated.kind === "window") {
      expect(dated.startMs).toBe(Date.UTC(2026, 7, 8));
    }
  });
});

describe("inferTemporalFields", () => {
  it("stores event dates and kinds from write-time text", () => {
    const event = inferTemporalFields(
      "Summit dinner with Alice",
      "Sat with Alice at the product summit dinner on 2026-09-08.",
      NOW,
      "episodic",
    );
    expect(event.temporalKind).toBe("event");
    expect(event.eventStart?.startsWith("2026-09-08")).toBe(true);
  });
});

describe("temporalScore", () => {
  const lastWeek = {
    title: "Summit dinner with Alice",
    content: "Sat with Alice at the product summit dinner.",
    type: "episodic" as const,
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "2026-09-15T00:00:00.000Z",
    eventStart: "2026-09-07T00:00:00.000Z",
    eventEnd: "2026-09-08T00:00:00.000Z",
    temporalKind: "event" as const,
  };
  const yesterday = {
    ...lastWeek,
    title: "Standup with Alice",
    content: "Alice joined the morning standup.",
    eventStart: "2026-09-16T00:00:00.000Z",
    eventEnd: "2026-09-17T00:00:00.000Z",
  };

  it("boosts the last-week event over yesterday for a last-week query", () => {
    const intent = classifyQueryTemporal("who did I sit with last week", NOW);
    expect(temporalScore(lastWeek, intent, NOW)).toBeGreaterThan(
      temporalScore(yesterday, intent, NOW),
    );
  });

  it("treats same-day start and end as a one-day event window", () => {
    const intent = classifyQueryTemporal("Alice last week", NOW);
    const point = {
      ...lastWeek,
      eventStart: "2026-09-07T15:00:00.000Z",
      eventEnd: "2026-09-07T15:00:00.000Z",
    };
    expect(temporalScore(point, intent, NOW)).toBeGreaterThan(0.9);
  });
});

describe("fact extraction temporal fields", () => {
  it("reads optional event metadata from LLM JSON", () => {
    const parsed = parseFactExtractionResponse(
      '{"facts":[{"id":0,"text":"I met Alice at the summit","temporalKind":"event","eventStart":"2026-09-10"}]}',
    );
    expect(parsed?.facts[0]).toEqual({
      id: 0,
      text: "I met Alice at the summit",
      temporalKind: "event",
      eventStart: "2026-09-10",
    });
  });
});
