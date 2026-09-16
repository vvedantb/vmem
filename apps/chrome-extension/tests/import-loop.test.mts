// locked cancelable import loop: lock, cancel, skip failures, no hang
// AI-generated (Claude), prompt: "unit tests for chrome extension import loop cancel and lock"
// Modified by me: zero delay, persist timestamp only when not cancelled
import test from "node:test";
import assert from "node:assert/strict";
import { installChromeMock } from "./helpers/chrome-mock.mts";

installChromeMock();

const { cancelImport, resetCancel, isCancelled } =
  await import("../src/background/import-cancel.ts");
const { runLockedImportLoop } =
  await import("../src/background/import-loop.ts");
const {
  acquireBookmarkLock,
  releaseBookmarkLock,
  acquireHistoryLock,
  releaseHistoryLock,
} = await import("../src/background/sync-lock.ts");
const { flattenBookmarks } =
  await import("../src/background/import-bookmarks.ts");
const { isImportableHistoryUrl } =
  await import("../src/background/import-history.ts");

await test("runLockedImportLoop returns locked when the lock is held", async () => {
  const result = await runLockedImportLoop({
    acquireLock: () => false,
    releaseLock: () => {
      throw new Error("must not release when lock was not acquired");
    },
    silent: true,
    loadItems: async () => {
      throw new Error("must not load items when locked");
    },
    toCreateParams: () => null,
    persistSyncTimestamp: async () => {
      throw new Error("must not persist when locked");
    },
    itemDelayMs: 0,
  });
  assert.deepEqual(result, { imported: 0, locked: true });
});

await test("runLockedImportLoop imports items and persists the timestamp", async () => {
  const created: string[] = [];
  let persisted = false;
  let released = false;
  const result = await runLockedImportLoop({
    acquireLock: () => true,
    releaseLock: () => {
      released = true;
    },
    silent: true,
    loadItems: async () => [{ title: "a" }, { title: "b" }],
    toCreateParams: (item) => ({
      title: item.title,
      content: item.title,
      type: "knowledge",
      source: "bookmarks",
      tags: [],
      confidence: 0.8,
      url: `https://example.com/${item.title}`,
    }),
    persistSyncTimestamp: async () => {
      persisted = true;
    },
    createItem: async (params) => {
      created.push(params.title);
    },
    itemDelayMs: 0,
  });
  assert.deepEqual(result, { imported: 2, locked: false });
  assert.deepEqual(created, ["a", "b"]);
  assert.equal(persisted, true);
  assert.equal(released, true);
});

await test("cancelImport stops the loop and skips the sync timestamp", async () => {
  resetCancel();
  const created: string[] = [];
  let persisted = false;
  const result = await runLockedImportLoop({
    acquireLock: () => true,
    releaseLock: () => {},
    silent: true,
    loadItems: async () => [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }],
    toCreateParams: (item) => ({
      title: String(item.n),
      content: String(item.n),
      type: "episodic",
      source: "browsing-history",
      tags: [],
      confidence: 0.6,
      url: `https://example.com/${item.n}`,
    }),
    persistSyncTimestamp: async () => {
      persisted = true;
    },
    createItem: async (params) => {
      created.push(params.title);
      if (created.length === 1) cancelImport();
    },
    itemDelayMs: 0,
  });
  assert.equal(isCancelled(), true);
  assert.equal(result.imported, 1);
  assert.deepEqual(created, ["1"]);
  assert.equal(persisted, false);
  resetCancel();
});

await test("createItem failures are skipped without hanging the loop", async () => {
  const created: string[] = [];
  const result = await runLockedImportLoop({
    acquireLock: () => true,
    releaseLock: () => {},
    silent: true,
    loadItems: async () => [{ ok: true }, { ok: false }, { ok: true }],
    toCreateParams: (item) => ({
      title: item.ok ? "ok" : "bad",
      content: "x",
      type: "knowledge",
      source: "bookmarks",
      tags: [],
      confidence: 0.8,
      url: "https://example.com/",
    }),
    persistSyncTimestamp: async () => {},
    createItem: async (params) => {
      if (params.title === "bad") throw new Error("create failed");
      created.push(params.title);
    },
    itemDelayMs: 0,
  });
  assert.equal(result.imported, 2);
  assert.deepEqual(created, ["ok", "ok"]);
});

await test("bookmark and history locks reject overlapping acquires", () => {
  assert.equal(acquireBookmarkLock(), true);
  assert.equal(acquireBookmarkLock(), false);
  releaseBookmarkLock();
  assert.equal(acquireBookmarkLock(), true);
  releaseBookmarkLock();

  assert.equal(acquireHistoryLock(), true);
  assert.equal(acquireHistoryLock(), false);
  releaseHistoryLock();
});

await test("flattenBookmarks walks folders and skips folder-only nodes", () => {
  const flat = flattenBookmarks([
    {
      id: "1",
      title: "Bar",
      children: [
        {
          id: "2",
          title: "Docs",
          children: [
            {
              id: "3",
              title: "Spec",
              url: "https://example.com/spec",
              dateAdded: 10,
            },
          ],
        },
        { id: "4", title: "empty-folder", children: [] },
      ],
    },
  ]);
  assert.equal(flat.length, 1);
  assert.equal(flat[0]?.title, "Spec");
  assert.deepEqual(flat[0]?.folderPath, ["Bar", "Docs"]);
});

await test("isImportableHistoryUrl skips browser-internal schemes", () => {
  assert.equal(isImportableHistoryUrl("https://example.com"), true);
  assert.equal(isImportableHistoryUrl("chrome://extensions"), false);
  assert.equal(
    isImportableHistoryUrl("chrome-extension://abc/popup.html"),
    false,
  );
  assert.equal(isImportableHistoryUrl("about:blank"), false);
  assert.equal(isImportableHistoryUrl("edge://settings"), false);
});
