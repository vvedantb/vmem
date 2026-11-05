import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_TRANSCRIPT_BYTES, truncateToBytes } from "./truncate.mjs";

void test("keeps text under the cap as is", () => {
  assert.equal(truncateToBytes("short"), "short");
});

void test("cuts text over the cap to the byte cap, keeping the start", () => {
  const line = `${"é".repeat(99)}\n`;
  const text = line.repeat(
    Math.ceil((MAX_TRANSCRIPT_BYTES * 2) / Buffer.byteLength(line)),
  );
  const out = truncateToBytes(text);
  assert.ok(Buffer.byteLength(out, "utf8") <= MAX_TRANSCRIPT_BYTES);
  assert.ok(out.startsWith(line));
  assert.match(out, /\n\n\[transcript truncated\]\n$/u);
  assert.doesNotMatch(out, /�/u);
  // cut at a line boundary: every kept line is whole
  const kept = out.replace(/\n\n\[transcript truncated\]\n$/u, "");
  for (const row of kept.split("\n")) assert.equal(row.length, 99);
});

void test("cuts multi-byte text with a small cap", () => {
  const out = truncateToBytes("ab\n".repeat(20) + "😀".repeat(50), 60);
  assert.ok(Buffer.byteLength(out, "utf8") <= 60);
  assert.doesNotMatch(out, /�/u);
});
