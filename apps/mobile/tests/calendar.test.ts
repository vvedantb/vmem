import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  buildCalendarPromotion,
  httpSummarizer,
  planCalendar,
  type CalendarEvent,
  type SummarizeDay,
} from "../src/capture/calendar";
import type { RawEvent } from "../modules/vmem-tracker/src/api";
import { bodyOf, HOUR, INSTALL, T0 } from "./helpers";

const sentSchema = z.object({
  date: z.string(),
  events: z.array(z.object({ title: z.string() }).passthrough()),
});

let nextId = 500;

function calendarEvent(
  overrides: Partial<CalendarEvent> = {},
  rawText?: string,
): RawEvent {
  const event: CalendarEvent = {
    id: "1-" + String(T0),
    day: "2026-01-05",
    title: "Planning",
    startMs: T0,
    endMs: T0 + HOUR,
    allDay: false,
    attendees: ["Sam"],
    calendarName: "Work",
    location: null,
    ...overrides,
  };
  return {
    id: nextId++,
    kind: "calendar",
    package: null,
    label: null,
    startMs: event.startMs,
    endMs: event.endMs,
    text: rawText ?? JSON.stringify(event),
    subject: null,
  };
}

const summary = {
  daySummary: { title: "Calendar: Monday 5 Jan", content: "A light day." },
  meetings: [
    { id: `1-${String(T0)}`, title: "Planning", content: "With Sam." },
    { id: "not-sent", title: "Ghost", content: "Invented." },
  ],
};

const options = (summarize: SummarizeDay, enabled = true) => ({
  enabled,
  installId: INSTALL,
  summarize,
});

describe("planCalendar", () => {
  it("groups by day, drops repeats and drains noise and unreadable events", () => {
    const planning = calendarEvent();
    const repeat = calendarEvent();
    const holiday = calendarEvent({ id: "2-0", allDay: true, attendees: [] });
    const broken = calendarEvent({}, "not json");
    const nextDay = calendarEvent({ id: "3-0", day: "2026-01-06" });
    const plan = planCalendar([nextDay, planning, repeat, holiday, broken]);
    assert.deepEqual(
      plan.days.map((day) => [day.day, day.events.length, day.rawIds.length]),
      [
        ["2026-01-05", 1, 2],
        ["2026-01-06", 1, 1],
      ],
    );
    assert.deepEqual(
      plan.drainIds.sort((a, b) => a - b),
      [holiday.id, broken.id].sort((a, b) => a - b),
    );
  });

  it("keeps an all-day event that has guests", () => {
    const offsite = calendarEvent({ allDay: true, attendees: ["Sam"] });
    assert.equal(planCalendar([offsite]).days.length, 1);
  });
});

describe("buildCalendarPromotion", () => {
  it("makes a day item and a meeting item with stable ids and sources", async () => {
    const raw = calendarEvent();
    const result = await buildCalendarPromotion(
      [raw],
      options(async () => summary),
    );
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.deleteEventIds, [raw.id]);
    assert.equal(result.items.length, 2);
    const [day, meeting] = result.items;
    assert.ok(day && meeting);
    assert.equal(day.kind, "calendar");
    assert.equal(day.externalId, `android:calendar:day:${INSTALL}:2026-01-05`);
    assert.equal(bodyOf(day).source, "android-calendar");
    assert.equal(bodyOf(day).sourceType, "android-calendar");
    assert.equal(bodyOf(day).title, "Calendar: Monday 5 Jan");
    assert.ok(bodyOf(day).tags?.includes("calendar"));
    assert.match(meeting.externalId, /^android:calendar:event:[0-9a-f]{14}$/);
    assert.equal(bodyOf(meeting).title, "Planning");
    assert.equal(meeting.startMs, T0);
    const again = await buildCalendarPromotion(
      [calendarEvent()],
      options(async () => summary),
    );
    assert.equal(again.items[1]?.externalId, meeting.externalId);
  });

  it("makes no item for a day with only noise and still drains it", async () => {
    const holiday = calendarEvent({ allDay: true, attendees: [] });
    const result = await buildCalendarPromotion(
      [holiday],
      options(async () => {
        throw new Error("must not be called");
      }),
    );
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.deleteEventIds, [holiday.id]);
  });

  it("keeps raw events and reports an error when the summary fails", async () => {
    const raw = calendarEvent();
    const result = await buildCalendarPromotion(
      [raw],
      options(async () => {
        throw new Error("server down");
      }),
    );
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.deleteEventIds, []);
    assert.deepEqual(result.errors, ["server down"]);
  });

  it("deletes calendar events and calls no server when turned off", async () => {
    const raw = calendarEvent();
    const result = await buildCalendarPromotion(
      [raw],
      options(async () => {
        throw new Error("must not be called");
      }, false),
    );
    assert.deepEqual(result, {
      items: [],
      deleteEventIds: [raw.id],
      errors: [],
    });
  });
});

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe("httpSummarizer", () => {
  const event = planCalendar([calendarEvent()]).days[0]?.events ?? [];

  it("posts the day with the bearer token and parses the reply", async () => {
    const seen: { url: string; auth: string | null; body: string }[] = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      seen.push({
        url: requestUrl(input),
        auth: new Headers(init?.headers).get("Authorization"),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return Response.json(summary);
    };
    const summarize = httpSummarizer({
      baseUrl: "https://x.test",
      token: "jwt",
      fetchImpl: fakeFetch,
    });
    assert.deepEqual(await summarize("2026-01-05", event), summary);
    assert.equal(
      seen[0]?.url,
      "https://x.test/api/v1/mobile/calendar/summarize",
    );
    assert.equal(seen[0]?.auth, "Bearer jwt");
    const sent = sentSchema.parse(JSON.parse(seen[0]?.body ?? "{}"));
    assert.equal(sent.date, "2026-01-05");
    assert.equal(sent.events[0]?.title, "Planning");
    assert.equal(
      sent.events[0] !== undefined && "location" in sent.events[0],
      false,
    );
  });

  it("explains a 422 and rejects a reply that breaks the contract", async () => {
    const make = (response: Response) =>
      httpSummarizer({
        baseUrl: "https://x.test",
        token: "jwt",
        fetchImpl: async () => response,
      });
    await assert.rejects(
      make(
        Response.json({ error: "summarization_unavailable" }, { status: 422 }),
      )("d", event),
      /not available/,
    );
    await assert.rejects(
      make(new Response("", { status: 502 }))("d", event),
      /HTTP 502/,
    );
    await assert.rejects(make(Response.json({ nope: 1 }))("d", event));
  });
});
