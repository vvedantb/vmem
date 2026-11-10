import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RawEvent } from "../modules/vmem-tracker/src/api";
import { buildPromotion, isEmptyPromotion } from "../src/capture/promote";
import { byNumber, INSTALL, MIN, share, T0, usage } from "./helpers";

const options = { collectedThroughMs: T0 + 61 * MIN, installId: INSTALL };

describe("buildPromotion", () => {
  it("makes share items only and drains usage events", () => {
    const early = usage(0, 20);
    const note = share("note");
    const open = usage(55, 70);
    const promotion = buildPromotion([early, note, open], options);
    assert.deepEqual(
      promotion.items.map((item) => item.kind),
      ["share"],
    );
    assert.deepEqual(
      promotion.deleteEventIds.sort(byNumber),
      [early.id, note.id].sort(byNumber),
    );
    assert.deepEqual(promotion.trimEvents, [
      { id: open.id, startMs: T0 + 60 * MIN },
    ]);
  });

  it("deletes an empty share without making an item", () => {
    const empty = share("");
    const promotion = buildPromotion([empty], options);
    assert.deepEqual(promotion.items, []);
    assert.deepEqual(promotion.deleteEventIds, [empty.id]);
  });

  it("leaves phase 2 and 3 kinds in the buffer", () => {
    const screenText: RawEvent = { ...usage(0, 10), kind: "screen_text" };
    const notification: RawEvent = { ...share("ping"), kind: "notification" };
    const promotion = buildPromotion([screenText, notification], options);
    assert.ok(isEmptyPromotion(promotion));
  });
});
