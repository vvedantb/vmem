import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDuration, hash53, utcRange } from "../src/capture/format";
import { MIN, T0 } from "./helpers";

describe("format", () => {
  it("formats durations like the desktop recorder", () => {
    assert.equal(formatDuration(20_000), "under 1 min");
    assert.equal(formatDuration(25 * MIN), "25 min");
    assert.equal(formatDuration(60 * MIN), "1 h");
    assert.equal(formatDuration(65 * MIN), "1 h 5 min");
  });

  it("formats UTC ranges with the end date only when it changes", () => {
    assert.equal(utcRange(T0, T0 + 30 * MIN), "2026-01-05 10:00 to 10:30 UTC");
    assert.equal(
      utcRange(T0, T0 + 24 * 60 * MIN),
      "2026-01-05 10:00 to 2026-01-06 10:00 UTC",
    );
  });

  it("hashes deterministically to 14 hex digits", () => {
    assert.equal(hash53("vmem"), hash53("vmem"));
    assert.notEqual(hash53("vmem"), hash53("vmem "));
    assert.match(hash53(""), /^[0-9a-f]{14}$/);
  });
});
