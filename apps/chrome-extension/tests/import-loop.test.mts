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
const { bookmarkToCreateParams, flattenBookmarks } =
  await import("../src/background/import-bookmarks.ts");
const {
  dedupeHistoryEntries,
  historyEntryToCreateParams,
  isImportableHistoryUrl,
} = await import("../src/background/import-history.ts");

const VHUB_TITLE = "vhub — your own hub for mcp connections and agent secrets";

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

await test("history params send externalId and sourceType, no visit count", () => {
  const params = historyEntryToCreateParams(
    {
      url: "https://www.example.com/a?utm_source=x",
      title: "(2) Example Page",
    },
    "profile-1",
  );
  assert.deepEqual(params, {
    title: "Example Page",
    content: "Example Page\nexample.com",
    type: "episodic",
    source: "browsing-history",
    sourceType: "browsing-history",
    externalId: "example.com|example page",
    tags: ["example.com"],
    confidence: 0.6,
    url: "https://www.example.com/a?utm_source=x",
    profileId: "profile-1",
  });
  assert.doesNotMatch(params?.content ?? "", /Visited/);
});

await test("history params use the canonical url when the title is missing", () => {
  const params = historyEntryToCreateParams(
    { url: "https://example.com/a?b=2&a=1#x", title: "" },
    undefined,
  );
  assert.equal(params?.externalId, "url|https://example.com/a?a=1&b=2");
  assert.equal(params?.title, "https://example.com/a?a=1&b=2");
  assert.equal(params?.content, "https://example.com/a?a=1&b=2");
  assert.equal(params?.url, "https://example.com/a?b=2&a=1#x");
});

await test("revisits with a new url send identical title and content", () => {
  const first = historyEntryToCreateParams(
    { url: "https://vhub.projectv.uk/", title: VHUB_TITLE },
    undefined,
  );
  const second = historyEntryToCreateParams(
    { url: "https://vhub.projectv.uk/connectors?view=mine", title: VHUB_TITLE },
    undefined,
  );
  assert.equal(first?.externalId, second?.externalId);
  assert.equal(first?.title, second?.title);
  assert.equal(first?.content, second?.content);
  assert.equal(second?.url, "https://vhub.projectv.uk/connectors?view=mine");
});

await test("same-title SPA routes in one batch create one memory", async () => {
  const entries = dedupeHistoryEntries([
    { url: "https://vhub.projectv.uk/connectors?view=mine", title: VHUB_TITLE },
    { url: "https://vhub.projectv.uk/connectors", title: VHUB_TITLE },
    { url: "https://vhub.projectv.uk/", title: VHUB_TITLE },
    { url: "chrome://extensions", title: "Extensions" },
    { url: "https://example.com/", title: "Example" },
  ]);
  const created: Array<{ externalId?: string; url?: string }> = [];
  const result = await runLockedImportLoop({
    acquireLock: () => true,
    releaseLock: () => {},
    silent: true,
    loadItems: async () => entries,
    toCreateParams: (entry) => historyEntryToCreateParams(entry, undefined),
    persistSyncTimestamp: async () => {},
    createItem: async (params) => {
      created.push({ externalId: params.externalId, url: params.url });
    },
    itemDelayMs: 0,
  });
  assert.equal(result.imported, 2);
  assert.deepEqual(created, [
    {
      externalId: `vhub.projectv.uk|${VHUB_TITLE}`,
      url: "https://vhub.projectv.uk/connectors?view=mine",
    },
    { externalId: "example.com|example", url: "https://example.com/" },
  ]);
});

await test("bookmark params key on the canonical url", () => {
  const params = bookmarkToCreateParams(
    {
      title: "Spec",
      url: "https://www.example.com/spec/?utm_campaign=x#intro",
      folderPath: ["Bar"],
    },
    "profile-1",
  );
  assert.deepEqual(params, {
    title: "Spec",
    content: "Spec\nhttps://example.com/spec",
    type: "knowledge",
    source: "bookmarks",
    sourceType: "bookmarks",
    externalId: "bookmark|https://example.com/spec",
    tags: ["Bar"],
    confidence: 0.8,
    url: "https://www.example.com/spec/?utm_campaign=x#intro",
    profileId: "profile-1",
  });
});
