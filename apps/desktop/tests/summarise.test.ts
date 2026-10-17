import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ActivityEvent } from "../src/events";
import { formatDuration, summarise } from "../src/summarise";

const T0 = Date.UTC(2026, 0, 5, 10, 0, 0);
const MIN = 60_000;

function focus(minutes: number, app: string, title: string): ActivityEvent {
  return { kind: "focus", at: T0 + minutes * MIN, app, title };
}

function gap(
  minutes: number,
  reason: "idle" | "paused" | "blocked" = "idle",
): ActivityEvent {
  return { kind: "gap", at: T0 + minutes * MIN, reason };
}

describe("summarise", () => {
  it("merges repeated samples into one memory with the duration", () => {
    const events = [
      focus(0, "Code", "search.ts - vmem - Code"),
      focus(10, "Code", "search.ts - vmem - Code"),
      focus(20, "Code", "search.ts - vmem - Code"),
      gap(45),
    ];
    const { memories, carryOver } = summarise(events, { endMs: T0 + 60 * MIN });
    assert.equal(memories.length, 1);
    assert.equal(
      memories[0]?.title,
      "Worked in Code on search.ts - vmem for 45 min",
    );
    assert.match(memories[0]?.content ?? "", /2026-01-05 10:00 to 10:45 UTC/);
    assert.deepEqual(memories[0]?.tags, ["desktop", "activity", "code"]);
    assert.equal(carryOver, null);
  });

  it("totals focus per app across windows and returns the biggest first", () => {
    const events = [
      focus(0, "Code", "a.ts"),
      focus(10, "Chrome", "Docs"),
      focus(15, "Code", "b.ts"),
      gap(40),
    ];
    const { memories } = summarise(events, { endMs: T0 + 40 * MIN });
    assert.deepEqual(
      memories.map((m) => m.title),
      [
        "Worked in Code on b.ts for 35 min",
        "Worked in Chrome on Docs for 5 min",
      ],
    );
    assert.match(memories[0]?.content ?? "", /- b\.ts \(25 min\)/);
  });

  it("does not count idle time as focus", () => {
    const events = [
      focus(0, "Code", "a.ts"),
      gap(10, "idle"),
      focus(30, "Code", "a.ts"),
      gap(40),
    ];
    const { memories } = summarise(events, { endMs: T0 + 60 * MIN });
    assert.equal(memories.length, 1);
    assert.match(memories[0]?.title ?? "", /for 20 min$/);
  });

  it("drops flickers under 30 s when longer sessions exist", () => {
    const events: ActivityEvent[] = [
      focus(0, "Code", "a.ts"),
      { kind: "focus", at: T0 + 10 * MIN, app: "Slack", title: "general" },
      { kind: "focus", at: T0 + 10 * MIN + 10_000, app: "Code", title: "a.ts" },
      gap(20),
    ];
    const { memories } = summarise(events, { endMs: T0 + 30 * MIN });
    assert.equal(memories.length, 1);
    assert.match(memories[0]?.title ?? "", /Code/);
  });

  it("keeps short sessions when they are the only activity", () => {
    const events = [focus(0, "Slack", "general"), gap(0.2)];
    const { memories } = summarise(events, { endMs: T0 + MIN });
    assert.equal(memories.length, 1);
    assert.match(memories[0]?.title ?? "", /Worked in Slack on general for/);
  });

  it("closes an open session at flush time and carries it over", () => {
    const { memories, carryOver } = summarise([focus(0, "Code", "a.ts")], {
      endMs: T0 + 15 * MIN,
    });
    assert.equal(memories.length, 1);
    assert.deepEqual(carryOver, {
      kind: "focus",
      at: T0 + 15 * MIN,
      app: "Code",
      title: "a.ts",
    });
  });

  it("returns nothing for no events or zero-length sessions", () => {
    assert.deepEqual(summarise([], { endMs: T0 }).memories, []);
    assert.deepEqual(
      summarise([focus(0, "Code", "a")], { endMs: T0 }).memories,
      [],
    );
  });

  it("writes one capture memory and says screenshots stay local", () => {
    const events: ActivityEvent[] = [
      focus(0, "Code", "a.ts"),
      { kind: "clipboard", at: T0 + 5 * MIN, text: "const x = 1" },
      { kind: "screenshot", at: T0 + 6 * MIN, file: "/tmp/a.png" },
      gap(10),
    ];
    const { memories } = summarise(events, { endMs: T0 + 10 * MIN });
    const capture = memories.find((m) => m.tags.includes("capture"));
    assert.equal(
      capture?.title,
      "Desktop capture: 1 clipboard copy and 1 screenshot",
    );
    assert.match(capture?.content ?? "", /not uploaded/);
    assert.match(capture?.content ?? "", /const x = 1/);
    assert.ok(!(capture?.content ?? "").includes("/tmp/a.png"));
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    assert.equal(formatDuration(10_000), "under 1 min");
    assert.equal(formatDuration(45 * MIN), "45 min");
    assert.equal(formatDuration(120 * MIN), "2 h");
    assert.equal(formatDuration(75 * MIN), "1 h 15 min");
  });
});
