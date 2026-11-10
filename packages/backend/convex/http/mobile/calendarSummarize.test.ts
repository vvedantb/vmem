import { describe, expect, it } from "vitest";
import {
  CALENDAR_SUMMARY_MODEL,
  calendarSummarizeBodySchema,
  calendarSummarizeRequest,
  type Generate,
} from "./calendarSummarize";

const body = calendarSummarizeBodySchema.parse({
  date: "2026-11-10",
  utcOffsetMinutes: 60,
  events: [
    {
      id: "e1",
      title: "Planning",
      startMs: 0,
      endMs: 1_800_000,
      allDay: false,
      attendees: ["Sam"],
    },
    {
      id: "e2",
      title: "Bank holiday",
      startMs: 0,
      endMs: 86_400_000,
      allDay: true,
      attendees: [],
    },
  ],
});

const reply =
  (text: string): Generate =>
  async () => ({ text });

const fixture = JSON.stringify({
  daySummary: { content: "One meeting and a holiday." },
  meetings: [
    { id: "e1", title: "Planning", content: "With Sam." },
    { id: "unknown", title: "Ghost", content: "Not in the request." },
  ],
});

describe("calendarSummarizeRequest", () => {
  it("returns a day title, the summary and meetings with request times", async () => {
    const calls: { model: string; providerOptions: unknown }[] = [];
    const prompts: string[] = [];
    const response = await calendarSummarizeRequest(body, async (call) => {
      prompts.push(call.messages.map((message) => message.content).join("\n"));
      calls.push({
        model: call.model,
        providerOptions: call.providerOptions,
      });
      return { text: `\`\`\`json\n${fixture}\n\`\`\`` };
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      daySummary: {
        title: "Calendar: Tuesday 10 Nov",
        content: "One meeting and a holiday.",
      },
      meetings: [
        {
          id: "e1",
          title: "Planning",
          content: "With Sam.",
          startMs: 0,
          endMs: 1_800_000,
        },
      ],
    });
    expect(prompts[0]).toContain('"start":"1970-01-01 01:00"');
    expect(calls).toEqual([
      {
        model: CALENDAR_SUMMARY_MODEL,
        providerOptions: { alibaba: { enableThinking: false } },
      },
    ]);
  });

  it("answers 422 without a gateway key", async () => {
    const response = await calendarSummarizeRequest(body, null);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: "summarization_unavailable",
    });
  });

  it("answers 502 for output that is not the expected JSON", async () => {
    for (const text of ["not json", '{"daySummary":{}}']) {
      const response = await calendarSummarizeRequest(body, reply(text));
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "invalid_model_output" });
    }
  });

  it("answers 502 when the model call fails", async () => {
    const response = await calendarSummarizeRequest(body, async () => {
      throw new Error("gateway down");
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "summarization_failed" });
  });
});

describe("calendarSummarizeBodySchema", () => {
  it("rejects an empty event list and a bad date", () => {
    expect(
      calendarSummarizeBodySchema.safeParse({ date: "2026-11-10", events: [] })
        .success,
    ).toBe(false);
    expect(
      calendarSummarizeBodySchema.safeParse({
        date: "10 Nov",
        events: body.events,
      }).success,
    ).toBe(false);
  });
});
