import { z } from "zod";
import type {
  QueueItemInput,
  RawEvent,
} from "../../modules/vmem-tracker/src/api";
import { hash53 } from "./format";
import { memoryBody } from "./memory";
import { postForModel, utcOffsetMinutes } from "./server";

/**
 * Calendar events become review items in two steps:
 *
 * 1. The native collector (CalendarCollector.kt) writes one raw `calendar`
 *    event per event instance of a past local day or of today. `text` holds a JSON
 *    object (`calendarEventSchema`). It exists only when the user turned
 *    Calendar on and allowed READ_CALENDAR.
 * 2. For each day the app asks the server to summarise it
 *    (`POST /api/v1/mobile/calendar/summarize`), then makes one day item and
 *    one item per meeting. If the summary fails, no item is made and the raw
 *    events stay for the next sync.
 */

export const calendarEventSchema = z.object({
  /** `<calendar event id>-<begin ms>`: unique per instance of a repeating event. */
  id: z.string().min(1),
  /** Local date `YYYY-MM-DD` that the event starts on. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  allDay: z.boolean(),
  attendees: z.array(z.string()),
  calendarName: z.string().nullable(),
  location: z.string().nullable(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarSummarySchema = z.object({
  daySummary: z.object({ title: z.string(), content: z.string() }),
  meetings: z.array(
    z.object({ id: z.string(), title: z.string(), content: z.string() }),
  ),
});
export type CalendarSummary = z.infer<typeof calendarSummarySchema>;

export type SummarizeDay = (
  day: string,
  events: readonly CalendarEvent[],
) => Promise<CalendarSummary>;

const SOURCE = "android-calendar";
const PROVENANCE = "Summarised from the phone calendar.";

/** Null when the raw event is not a calendar event the app can read. */
export function parseCalendarEvent(event: RawEvent): CalendarEvent | null {
  if (event.kind !== "calendar" || event.text === null) return null;
  try {
    const parsed = calendarEventSchema.safeParse(JSON.parse(event.text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** All-day events without attendees are holidays, birthdays and reminders. */
function isNoise(event: CalendarEvent): boolean {
  return event.allDay && event.attendees.length === 0;
}

interface CalendarDay {
  day: string;
  events: CalendarEvent[];
  rawIds: number[];
}

/** Groups readable events by day, oldest first. Noise and repeats go to `drainIds`. */
export function planCalendar(raw: readonly RawEvent[]): {
  days: CalendarDay[];
  drainIds: number[];
} {
  const days = new Map<string, CalendarDay>();
  const drainIds: number[] = [];
  for (const rawEvent of raw) {
    if (rawEvent.kind !== "calendar") continue;
    const event = parseCalendarEvent(rawEvent);
    if (event === null || isNoise(event)) {
      drainIds.push(rawEvent.id);
      continue;
    }
    const day = days.get(event.day) ?? {
      day: event.day,
      events: [],
      rawIds: [],
    };
    day.rawIds.push(rawEvent.id);
    if (!day.events.some((known) => known.id === event.id)) {
      day.events.push(event);
    }
    days.set(event.day, day);
  }
  const sorted = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  for (const day of sorted) day.events.sort((a, b) => a.startMs - b.startMs);
  return { days: sorted, drainIds };
}

/** Day item and meeting items for one summarised day. */
export function calendarItems(
  day: CalendarDay,
  summary: CalendarSummary,
  installId: string,
): QueueItemInput[] {
  const startMs = Math.min(...day.events.map((event) => event.startMs));
  const endMs = Math.max(...day.events.map((event) => event.endMs));
  const dayId = `android:calendar:day:${installId}:${day.day}`;
  const items: QueueItemInput[] = [
    {
      kind: "calendar",
      externalId: dayId,
      startMs,
      endMs,
      body: JSON.stringify(
        memoryBody({
          title: summary.daySummary.title,
          content: `${summary.daySummary.content}\n\n${PROVENANCE}`,
          tags: ["calendar", "calendar-day"],
          externalId: dayId,
          source: SOURCE,
        }),
      ),
    },
  ];
  const seen = new Set<string>();
  for (const meeting of summary.meetings) {
    const event = day.events.find((known) => known.id === meeting.id);
    // The model may only describe events the phone sent, once each.
    if (event === undefined || seen.has(event.id)) continue;
    seen.add(event.id);
    const externalId = `android:calendar:event:${hash53(`${installId}:${event.id}`)}`;
    items.push({
      kind: "calendar",
      externalId,
      startMs: event.startMs,
      endMs: event.endMs,
      body: JSON.stringify(
        memoryBody({
          title: meeting.title,
          content: `${meeting.content}\n\n${PROVENANCE}`,
          tags: ["calendar", "calendar-meeting"],
          externalId,
          source: SOURCE,
        }),
      ),
    });
  }
  return items;
}

export interface CalendarPromotion {
  items: QueueItemInput[];
  deleteEventIds: number[];
  /** One message per day that could not be summarised. Those events stay. */
  errors: string[];
}

/**
 * Review items for every collected day, after the server summarised it.
 * Turned off: deletes the raw events and makes nothing. A day that fails to
 * summarise makes no item and keeps its raw events for the next sync.
 */
export async function buildCalendarPromotion(
  raw: readonly RawEvent[],
  options: { enabled: boolean; installId: string; summarize: SummarizeDay },
): Promise<CalendarPromotion> {
  if (!options.enabled) {
    return {
      items: [],
      deleteEventIds: raw
        .filter((event) => event.kind === "calendar")
        .map((event) => event.id),
      errors: [],
    };
  }
  const plan = planCalendar(raw);
  const result: CalendarPromotion = {
    items: [],
    deleteEventIds: [...plan.drainIds],
    errors: [],
  };
  for (const day of plan.days) {
    try {
      const summary = await options.summarize(day.day, day.events);
      result.items.push(...calendarItems(day, summary, options.installId));
      result.deleteEventIds.push(...day.rawIds);
    } catch (caught) {
      result.errors.push(
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  }
  return result;
}

/** Posts one day to the server. Throws an `Error` with a message for the user. */
export function httpSummarizer(options: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): SummarizeDay {
  return (day, events) =>
    postForModel({
      ...options,
      path: "/api/v1/mobile/calendar/summarize",
      body: {
        date: day,
        utcOffsetMinutes: utcOffsetMinutes(events[0]?.startMs ?? Date.now()),
        events: events.map((event) => ({
          id: event.id,
          title: event.title,
          startMs: event.startMs,
          endMs: event.endMs,
          allDay: event.allDay,
          attendees: event.attendees,
          ...(event.calendarName ? { calendarName: event.calendarName } : {}),
          ...(event.location ? { location: event.location } : {}),
        })),
      },
      schema: calendarSummarySchema,
      label: "Calendar summary",
      unavailable: "Calendar summaries are not available on the server yet.",
    });
}
