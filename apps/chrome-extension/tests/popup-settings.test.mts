// extension sync-interval, profile, Clerk host and page-extraction behaviour
// AI-generated (Claude), prompt: "tests for extension popup signed-out copy and settings extension page"
// Modified by me: behavioural tests only; source-text checks removed
import test from "node:test";
import assert from "node:assert/strict";
import {
  describeSyncInterval,
  shortSyncInterval,
  syncIntervalAt,
  syncIntervalIndex,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  clerkCookieSyncHost,
  clerkFrontendApiHost,
} from "../src/lib/constants.ts";
import { resolveExtensionProfileId } from "../src/lib/resolve-extension-profile.ts";
import { convexSettingsToStorageMirror } from "../src/types/storage.ts";
import { errorMessage } from "../src/lib/error.ts";
import {
  htmlToMarkdown,
  htmlToMarkdownSafe,
} from "../src/lib/page-extraction.ts";

await test("sync interval labels stay human-readable", () => {
  assert.equal(
    describeSyncInterval(DEFAULT_SYNC_INTERVAL_MINUTES),
    "Every 30 minutes",
  );
  assert.equal(describeSyncInterval(60), "Every hour");
  assert.equal(describeSyncInterval(120), "Every 2 hours");
  assert.equal(shortSyncInterval(30), "30m");
  assert.equal(shortSyncInterval(360), "6h");
});

await test("sync frequency slider maps presets to indexes and snaps legacy values", () => {
  assert.equal(syncIntervalIndex(15), 0);
  assert.equal(syncIntervalIndex(DEFAULT_SYNC_INTERVAL_MINUTES), 1);
  assert.equal(syncIntervalIndex(1440), 7);
  assert.equal(syncIntervalIndex(100), 3);
  assert.equal(syncIntervalIndex(45), 1);
  assert.equal(syncIntervalIndex(5000), 7);
  assert.equal(syncIntervalAt(3), 120);
  assert.equal(syncIntervalAt(99), DEFAULT_SYNC_INTERVAL_MINUTES);
});

await test("resolveExtensionProfileId prefers storage then convex then account default", () => {
  const profiles = [
    { _id: "a", isDefault: false },
    { _id: "b", isDefault: true },
    { _id: "c", isDefault: false },
  ];
  assert.equal(
    resolveExtensionProfileId({
      storageProfileId: "c",
      convexExtensionDefaultId: "a",
      profiles,
    }),
    "c",
  );
  assert.equal(
    resolveExtensionProfileId({
      storageProfileId: "gone",
      convexExtensionDefaultId: "a",
      profiles,
    }),
    "a",
  );
  assert.equal(
    resolveExtensionProfileId({
      storageProfileId: "",
      convexExtensionDefaultId: null,
      profiles,
    }),
    "b",
  );
});

await test("convexSettingsToStorageMirror copies extension settings", () => {
  const mirrored = convexSettingsToStorageMirror({
    extensionAutoSyncEnabled: false,
    extensionAutoSyncIntervalMinutes: 120,
    extensionSelectionPopupEnabled: false,
    defaultProfiles: { extension: "p1" },
  });
  assert.deepEqual(mirrored, {
    autoSyncEnabled: false,
    autoSyncIntervalMinutes: 120,
    selectionPopupEnabled: false,
    defaultProfileId: "p1",
  });
});

await test("errorMessage stringifies unknown values", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage("nope"), "nope");
});

await test("htmlToMarkdown converts headings and drops empty links", () => {
  const md = htmlToMarkdown(
    "<h1>Title</h1><p>Hello <a href='https://x'></a>world</p>",
  );
  assert.match(md, /# Title/);
  assert.match(md, /Hello/);
  assert.match(md, /world/);
});

await test("htmlToMarkdownSafe keeps converted markdown in node", () => {
  assert.match(htmlToMarkdownSafe("<h1>Safe</h1>", "fallback"), /# Safe/);
});

await test("live Clerk cookie sync host is the FAPI origin, not the web app", () => {
  assert.equal(
    clerkFrontendApiHost("pk_live_Y2xlcmsucHJvamVjdHYudWsk"),
    "clerk.projectv.uk",
  );
  assert.equal(
    clerkCookieSyncHost(
      "pk_live_Y2xlcmsucHJvamVjdHYudWsk",
      "https://vmem.projectv.uk",
    ),
    "https://clerk.projectv.uk",
  );
  assert.equal(
    clerkCookieSyncHost(
      "pk_test_YWxsb3dpbmctY295b3RlLTgwLmNsZXJrLmFjY291bnRzLmRldiQ",
      "http://localhost:5173",
    ),
    "http://localhost:5173",
  );
});
