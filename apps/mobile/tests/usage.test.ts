import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planUsage } from "../src/capture/usage";
import { byNumber, HOUR, MIN, T0, usage } from "./helpers";

const done = (minutesAfterT0: number) => ({
  collectedThroughMs: T0 + minutesAfterT0 * MIN,
});

describe("planUsage", () => {
  it("makes no items but deletes events inside finished hours", () => {
    const events = [
      usage(2, 15),
      usage(30, 42),
      usage(20, 25, "com.google.android.apps.maps", "Maps"),
    ];
    const plan = planUsage(events, done(65));
    assert.deepEqual(plan.items, []);
    assert.deepEqual(
      plan.deleteEventIds.sort(byNumber),
      events.map((e) => e.id).sort(byNumber),
    );
    assert.deepEqual(plan.trimEvents, []);
  });

  it("waits until the hour is over", () => {
    const plan = planUsage([usage(5, 20)], done(50));
    assert.deepEqual(plan, { items: [], deleteEventIds: [], trimEvents: [] });
  });

  it("trims the event that reaches into the open hour", () => {
    const event = usage(50, 75);
    const plan = planUsage([event], done(80));
    assert.deepEqual(plan.items, []);
    assert.deepEqual(plan.deleteEventIds, []);
    assert.deepEqual(plan.trimEvents, [{ id: event.id, startMs: T0 + HOUR }]);
  });

  it("drains short events too", () => {
    const short = usage(10, 10.5);
    const plan = planUsage([short], done(61));
    assert.deepEqual(plan.items, []);
    assert.deepEqual(plan.deleteEventIds, [short.id]);
  });
});
