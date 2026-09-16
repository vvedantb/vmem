// popup auth copy and dashboard /settings/extension have no codebase prompts
// AI-generated (Claude), prompt: "tests for extension popup signed-out copy and settings extension page"
// Modified by me: signed-in tabs, auto-sync switches, codebase-free settings
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  describeSyncInterval,
  shortSyncInterval,
  DEFAULT_SYNC_INTERVAL_MINUTES,
  clerkCookieSyncHost,
  clerkFrontendApiHost,
} from "../src/lib/constants.ts";
import { resolveExtensionProfileId } from "../src/lib/resolve-extension-profile.ts";
import { convexSettingsToStorageMirror } from "../src/types/storage.ts";
import { errorMessage } from "../src/lib/error.ts";
import { htmlToMarkdown } from "../src/lib/page-extraction.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

const popupApp = readRepo("apps/chrome-extension/src/popup/App.tsx");
const settingsForm = readRepo(
  "apps/chrome-extension/src/popup/_components/SettingsForm.tsx",
);
const dashboardExtension = readRepo(
  "apps/web/src/routes/_main/settings/extension.tsx",
);
const navConfig = readRepo("apps/web/src/components/sidebar/nav-config.ts");

await test("popup has distinct signed-out and signed-in states", () => {
  assert.match(popupApp, /Sign in to start saving memories/);
  assert.match(popupApp, /SignedOutContent/);
  assert.match(popupApp, /SignedInContent/);
  assert.match(popupApp, /when="signed-in"/);
  assert.match(popupApp, /when="signed-out"/);
  assert.match(popupApp, /QuickSave/);
  assert.match(popupApp, /ImportPanel/);
  assert.match(popupApp, /SettingsForm/);
});

await test("popup settings do not prompt for codebase sync", () => {
  assert.equal(/codebase/i.test(settingsForm), false);
  assert.match(settingsForm, /Auto-sync history/);
});

await test("dashboard /settings/extension stays in nav and has no codebase prompts", () => {
  assert.match(navConfig, /href: "\/settings\/extension"/);
  assert.match(
    dashboardExtension,
    /createFileRoute\("\/_main\/settings\/extension"\)/,
  );
  assert.match(dashboardExtension, /extensionAutoSyncEnabled/);
  assert.match(dashboardExtension, /extensionSelectionPopupEnabled/);
  assert.equal(/codebase/i.test(dashboardExtension), false);
});

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

await test("wxt manifest maps Alt+S / Alt+Shift+S and prod Clerk host permissions", () => {
  const wxt = readRepo("apps/chrome-extension/wxt.config.ts");
  assert.match(wxt, /"save-page"/);
  assert.match(wxt, /default: "Alt\+S"/);
  assert.match(wxt, /"take-screenshot"/);
  assert.match(wxt, /default: "Alt\+Shift\+S"/);
  assert.match(wxt, /https:\/\/vmem\.vedantb\.com\/\*/);
  assert.match(wxt, /https:\/\/clerk\.vedantb\.com\/\*/);
});

await test("live Clerk cookie sync host is the FAPI origin, not the web app", () => {
  assert.equal(
    clerkFrontendApiHost("pk_live_Y2xlcmsudmVkYW50Yi5jb20k"),
    "clerk.vedantb.com",
  );
  assert.equal(
    clerkCookieSyncHost(
      "pk_live_Y2xlcmsudmVkYW50Yi5jb20k",
      "https://vmem.vedantb.com",
    ),
    "https://clerk.vedantb.com",
  );
  assert.equal(
    clerkCookieSyncHost(
      "pk_test_ZmxleGlibGUtZHVja2xpbmctNzQuY2xlcmsuYWNjb3VudHMuZGV2JA",
      "http://localhost:5173",
    ),
    "http://localhost:5173",
  );
  const providers = readRepo("apps/chrome-extension/src/popup/providers.tsx");
  assert.match(providers, /CLERK_COOKIE_SYNC_HOST/);
  const tokenRefresh = readRepo(
    "apps/chrome-extension/src/lib/refresh-convex-token.ts",
  );
  assert.match(tokenRefresh, /CLERK_COOKIE_SYNC_HOST/);
});

await test("background message handler registers save, import, and screenshot messages", () => {
  const src = readRepo(
    "apps/chrome-extension/src/background/message-handler.ts",
  );
  for (const name of [
    "retrieveMemories",
    "savePage",
    "saveYoutubeVideo",
    "capturePrompt",
    "saveSelection",
    "captureVisibleTab",
    "saveScreenshot",
    "importBookmarks",
    "importHistory",
    "cancelImport",
    "debugRunAutoSync",
  ]) {
    assert.match(src, new RegExp(`onMessage\\("${name}"`));
  }
});

await test("popup import panel exposes cancel while an import is running", () => {
  const importPanel = readRepo(
    "apps/chrome-extension/src/popup/_components/ImportPanel.tsx",
  );
  assert.match(importPanel, /sendMessage\("cancelImport"\)/);
  assert.match(importPanel, /setBookmarkStatus\("cancelled"\)/);
  assert.match(importPanel, /setHistoryStatus\("cancelled"\)/);
});

await test("popup QuickSave reports success and failure from the save result", () => {
  const quickSave = readRepo(
    "apps/chrome-extension/src/popup/_components/QuickSave.tsx",
  );
  assert.match(quickSave, /sendMessage\("savePage"/);
  assert.match(quickSave, /Page saved to vmem/);
  assert.match(quickSave, /Failed to extract page/);
});
