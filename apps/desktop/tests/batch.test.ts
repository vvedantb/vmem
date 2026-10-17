import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { BatchStore, flushBatch } from "../src/batch";
import type { MemoryDraft } from "../src/summarise";

const T0 = Date.UTC(2026, 0, 5, 10, 0, 0);
const MIN = 60_000;

describe("BatchStore and flushBatch", () => {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vmem-desktop-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists events across instances", () => {
    new BatchStore(dir).append({
      kind: "focus",
      at: T0,
      app: "Code",
      title: "a",
    });
    assert.equal(new BatchStore(dir).snapshot().length, 1);
  });

  it("caps the backlog and keeps the newest events", () => {
    const store = new BatchStore(dir, 3);
    for (let i = 0; i < 5; i++) {
      store.append({
        kind: "focus",
        at: T0 + i,
        app: "Code",
        title: String(i),
      });
    }
    assert.deepEqual(
      store.snapshot().map((e) => e.at - T0),
      [2, 3, 4],
    );
  });

  it("posts summaries, clears events and keeps the open session", async () => {
    const store = new BatchStore(dir);
    store.append({ kind: "focus", at: T0, app: "Code", title: "a.ts" });
    const posted: MemoryDraft[] = [];
    const result = await flushBatch(
      store,
      async (draft) => {
        posted.push(draft);
      },
      T0 + 15 * MIN,
    );
    assert.equal(result.posted, 1);
    assert.equal(posted.length, 1);
    assert.deepEqual(store.snapshot(), [
      { kind: "focus", at: T0 + 15 * MIN, app: "Code", title: "a.ts" },
    ]);
  });

  it("keeps events when posting fails", async () => {
    const store = new BatchStore(dir);
    store.append({ kind: "focus", at: T0, app: "Code", title: "a.ts" });
    await assert.rejects(
      flushBatch(
        store,
        async () => {
          throw new Error("offline");
        },
        T0 + 15 * MIN,
      ),
      /offline/,
    );
    assert.equal(store.snapshot().length, 1);
    assert.equal(store.snapshot()[0]?.at, T0);
  });

  it("does nothing for an empty store", async () => {
    const result = await flushBatch(new BatchStore(dir), async () => {}, T0);
    assert.equal(result.posted, 0);
  });
});
