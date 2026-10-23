import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_THRESHOLD_MAX,
  CONFIDENCE_THRESHOLD_MIN,
  handleNativeRangeKeyDown,
  nativeRangeKeyValue,
} from "@vmem/shared";
import { TIMELINE_SCRUBBER_STEPS } from "@/lib/memory-timeline-view";

const confidence = {
  min: CONFIDENCE_THRESHOLD_MIN,
  max: CONFIDENCE_THRESHOLD_MAX,
  step: 5,
};
const scrubber = { min: 0, max: TIMELINE_SCRUBBER_STEPS, step: 1 };

function keyEvent(key: string, shiftKey = false) {
  const event = {
    key,
    shiftKey,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
}

describe("nativeRangeKeyValue", () => {
  it("leaves plain arrows and Home/End to Radix", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      expect(nativeRangeKeyValue(key, false, 50, confidence)).toBeNull();
    }
    expect(nativeRangeKeyValue("Home", false, 50, confidence)).toBeNull();
    expect(nativeRangeKeyValue("End", true, 50, confidence)).toBeNull();
    expect(nativeRangeKeyValue("Tab", true, 50, confidence)).toBeNull();
  });

  it("moves one step on Shift+Arrow, not ten", () => {
    expect(nativeRangeKeyValue("ArrowRight", true, 50, confidence)).toBe(55);
    expect(nativeRangeKeyValue("ArrowUp", true, 50, confidence)).toBe(55);
    expect(nativeRangeKeyValue("ArrowLeft", true, 50, confidence)).toBe(45);
    expect(nativeRangeKeyValue("ArrowDown", true, 50, confidence)).toBe(45);
    expect(nativeRangeKeyValue("ArrowRight", true, 500, scrubber)).toBe(501);
  });

  it("moves 10% of the range on PageUp/PageDown", () => {
    expect(nativeRangeKeyValue("PageUp", false, 50, confidence)).toBe(60);
    expect(nativeRangeKeyValue("PageDown", false, 50, confidence)).toBe(40);
    expect(nativeRangeKeyValue("PageUp", true, 50, confidence)).toBe(60);
    expect(nativeRangeKeyValue("PageUp", false, 500, scrubber)).toBe(600);
    expect(nativeRangeKeyValue("PageDown", false, 500, scrubber)).toBe(400);
  });

  it("clamps to min and max", () => {
    expect(nativeRangeKeyValue("PageUp", false, 95, confidence)).toBe(100);
    expect(nativeRangeKeyValue("PageDown", false, 5, confidence)).toBe(0);
    expect(nativeRangeKeyValue("PageUp", false, 950, scrubber)).toBe(1000);
    expect(nativeRangeKeyValue("ArrowLeft", true, 0, scrubber)).toBe(0);
  });

  it("snaps off-grid values to the step", () => {
    expect(nativeRangeKeyValue("ArrowRight", true, 52, confidence)).toBe(55);
    expect(
      nativeRangeKeyValue("PageUp", false, 7, { min: 0, max: 12, step: 5 }),
    ).toBe(10);
  });
});

describe("handleNativeRangeKeyDown", () => {
  it("prevents Radix and reports the native value", () => {
    const changes: number[] = [];
    const event = keyEvent("PageUp");
    handleNativeRangeKeyDown(event, 50, confidence, (next) =>
      changes.push(next),
    );
    expect(event.prevented).toBe(true);
    expect(changes).toEqual([60]);
  });

  it("does not touch keys Radix already gets right", () => {
    const changes: number[] = [];
    const event = keyEvent("ArrowRight");
    handleNativeRangeKeyDown(event, 50, confidence, (next) =>
      changes.push(next),
    );
    expect(event.prevented).toBe(false);
    expect(changes).toEqual([]);
  });

  it("prevents but does not report a change at the edge", () => {
    const changes: number[] = [];
    const event = keyEvent("PageUp");
    handleNativeRangeKeyDown(event, 100, confidence, (next) =>
      changes.push(next),
    );
    expect(event.prevented).toBe(true);
    expect(changes).toEqual([]);
  });
});
