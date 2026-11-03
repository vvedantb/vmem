import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planUsage, usageExternalId } from "../src/capture/usage";
import { bodyOf, byNumber, HOUR, INSTALL, MIN, T0, usage } from "./helpers";

const done = (minutesAfterT0: number) => ({
  collectedThroughMs: T0 + minutesAfterT0 * MIN,
  installId: INSTALL,
});

describe("planUsage", () => {
  it("makes one item per app per finished hour, biggest detail in the body", () => {
    const events = [
      usage(2, 15),
      usage(30, 42),
      usage(20, 25, "com.google.android.apps.maps", "Maps"),
    ];
    const plan = planUsage(events, done(65));
    assert.equal(plan.items.length, 2);
    const chrome = plan.items.find((item) =>
      bodyOf(item).title.includes("Chrome"),
    );
    assert.ok(chrome);
    const body = bodyOf(chrome);
    assert.equal(body.title, "Used Chrome for 25 min");
    assert.match(body.content, /from 2026-01-05 10:02 to 10:42 UTC/);
    assert.match(body.content, /Screen time: 25 min over 2 sessions\./);
    assert.match(body.content, /- 10:02 to 10:15 \(13 min\)/);
    assert.match(body.content, /App id: com\.android\.chrome/);
    assert.deepEqual(
      plan.deleteEventIds.sort(byNumber),
      events.map((e) => e.id).sort(byNumber),
    );
    assert.deepEqual(plan.trimEvents, []);
  });

  it("sends the desktop-style payload: android source, episodic, tagged", () => {
    const [item] = planUsage([usage(0, 30)], done(61)).items;
    assert.ok(item);
    const body = bodyOf(item);
    assert.equal(body.type, "episodic");
    assert.equal(body.source, "android");
    assert.equal(body.sourceType, "android");
    assert.deepEqual(body.tags, ["android", "activity", "chrome"]);
    assert.equal(body.externalId, item.externalId);
    assert.equal(item.kind, "app_usage");
  });

  it("waits until the hour is over", () => {
    const plan = planUsage([usage(5, 20)], done(50));
    assert.deepEqual(plan, { items: [], deleteEventIds: [], trimEvents: [] });
  });

  it("splits a session at the hour and trims the event that reaches into the open hour", () => {
    const event = usage(50, 75);
    const plan = planUsage([event], done(80));
    assert.equal(plan.items.length, 1);
    assert.equal(
      bodyOf(plan.items[0] ?? { body: "{}" }).title,
      "Used Chrome for 10 min",
    );
    assert.deepEqual(plan.deleteEventIds, []);
    assert.deepEqual(plan.trimEvents, [{ id: event.id, startMs: T0 + HOUR }]);
  });

  it("splits a long session into one item per hour", () => {
    const plan = planUsage([usage(30, 150)], done(185));
    assert.deepEqual(
      plan.items.map((item) => bodyOf(item).title),
      [
        "Used Chrome for 30 min",
        "Used Chrome for 1 h",
        "Used Chrome for 30 min",
      ],
    );
  });

  it("drops apps used under a minute but still consumes their events", () => {
    const short = usage(10, 10.5);
    const plan = planUsage([short], done(61));
    assert.deepEqual(plan.items, []);
    assert.deepEqual(plan.deleteEventIds, [short.id]);
  });

  it("joins parts the collector split at run boundaries", () => {
    const plan = planUsage([usage(0, 15), usage(15, 30)], done(61));
    const [item] = plan.items;
    assert.ok(item);
    assert.match(bodyOf(item).content, /over 1 session\./);
  });

  it("uses the newest label and ignores other kinds", () => {
    const renamed = usage(30, 40, "com.android.chrome", "Chrome Beta");
    const plan = planUsage([usage(0, 10), renamed], done(61));
    assert.equal(
      bodyOf(plan.items[0] ?? { body: "{}" }).title,
      "Used Chrome Beta for 20 min",
    );
  });
});

describe("usageExternalId", () => {
  it("is stable per install, app and UTC hour", () => {
    const id = usageExternalId(INSTALL, "com.android.chrome", T0);
    assert.equal(
      id,
      "android:usage:install-1:com.android.chrome:2026-01-05T10",
    );
    assert.equal(id, usageExternalId(INSTALL, "com.android.chrome", T0));
    assert.notEqual(id, usageExternalId("install-2", "com.android.chrome", T0));
    assert.notEqual(
      id,
      usageExternalId(INSTALL, "com.android.chrome", T0 + HOUR),
    );
  });

  it("gives a retried promotion the same id", () => {
    const first = planUsage([usage(0, 30)], done(61)).items[0];
    const again = planUsage([usage(0, 30)], done(200)).items[0];
    assert.equal(first?.externalId, again?.externalId);
  });
});
