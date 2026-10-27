// popup sync-frequency slider keyboard parity with the old native range input
import test from "node:test";
import assert from "node:assert/strict";
import { handleNativeRangeKeyDown, nativeRangeKeyValue } from "@vmem/shared";

// index-based presets slider: 8 presets, 0..7, step 1
const presets = { min: 0, max: 7, step: 1 };

await test("Shift+Arrow moves one preset", () => {
  assert.equal(nativeRangeKeyValue("ArrowRight", true, 3, presets), 4);
  assert.equal(nativeRangeKeyValue("ArrowDown", true, 3, presets), 2);
});

await test("PageUp/PageDown round 10% of the range up to one step", () => {
  assert.equal(nativeRangeKeyValue("PageUp", false, 3, presets), 4);
  assert.equal(nativeRangeKeyValue("PageDown", false, 3, presets), 2);
  assert.equal(nativeRangeKeyValue("PageUp", false, 7, presets), 7);
  assert.equal(nativeRangeKeyValue("PageDown", false, 0, presets), 0);
});

await test("plain arrows and Home/End stay with Radix", () => {
  assert.equal(nativeRangeKeyValue("ArrowRight", false, 3, presets), null);
  assert.equal(nativeRangeKeyValue("Home", false, 3, presets), null);
  assert.equal(nativeRangeKeyValue("End", false, 3, presets), null);
});

await test("handler prevents Radix and reports the next index", () => {
  const changes: number[] = [];
  let prevented = false;
  handleNativeRangeKeyDown(
    {
      key: "PageUp",
      shiftKey: false,
      preventDefault: () => {
        prevented = true;
      },
    },
    3,
    presets,
    (next) => changes.push(next),
  );
  assert.equal(prevented, true);
  assert.deepEqual(changes, [4]);
});
