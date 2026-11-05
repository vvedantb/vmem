import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  readSubmitted,
  recordSubmitted,
  skipReason,
  withSubmitted,
} from "./dedupe.mjs";

test("skips a session with fewer than 3 user turns", () => {
  assert.match(
    skipReason({ sessionId: "s1", userTurns: 2, submitted: [] }) ?? "",
    /user turn/u,
  );
  assert.equal(
    skipReason({ sessionId: "s1", userTurns: 3, submitted: [] }),
    null,
  );
});

test("skips a session id that was already submitted", () => {
  assert.match(
    skipReason({ sessionId: "s1", userTurns: 5, submitted: ["s1"] }) ?? "",
    /already submitted/u,
  );
});

test("caps the list and keeps the newest ids", () => {
  assert.deepEqual(withSubmitted(["a", "b", "c"], "d", 3), ["b", "c", "d"]);
  assert.deepEqual(withSubmitted(["a", "b"], "a", 3), ["b", "a"]);
});

test("records submitted ids in the state file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vmem-hook-"));
  try {
    const path = join(dir, "nested", "state.json");
    assert.deepEqual(await readSubmitted(path), []);
    await recordSubmitted(path, "s1");
    await recordSubmitted(path, "s1");
    await recordSubmitted(path, "s2");
    assert.deepEqual(await readSubmitted(path), ["s1", "s2"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
