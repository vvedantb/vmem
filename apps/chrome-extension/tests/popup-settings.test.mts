// popup auth copy and dashboard /settings/extension have no codebase prompts
// AI-generated (Claude), prompt: "tests for extension popup signed-out copy and settings extension page"
// Modified by me: signed-in tabs, auto-sync switches, codebase-free settings
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

// the @vvedantb/ui copy an app resolves (pnpm may nest it per app)
function uiDirFor(appRel: string): string {
  const require = createRequire(path.join(repoRoot, appRel, "package.json"));
  return path.dirname(require.resolve("@vvedantb/ui/package.json"));
}

const extensionUiDir = uiDirFor("apps/chrome-extension");

function extensionSourceFiles(
  dir = path.join(repoRoot, "apps/chrome-extension/src"),
): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return extensionSourceFiles(full);
    return /\.(ts|tsx|html|css)$/.test(entry.name) ? [full] : [];
  });
}

const popupApp = readRepo("apps/chrome-extension/src/popup/App.tsx");
const settingsForm = readRepo(
  "apps/chrome-extension/src/popup/_components/SettingsForm.tsx",
);
const dashboardExtensionRoute = readRepo(
  "apps/web/src/routes/_main/settings/extension.tsx",
);
const dashboardExtensionPage = readRepo(
  "apps/web/src/components/settings/ExtensionSettingsClient.tsx",
);
const navConfig = readRepo("apps/web/src/components/sidebar/nav-config.ts");

await test("popup Tailwind scans the @vvedantb/ui the extension resolves so overlay primitives get CSS", () => {
  const globalsCss = readRepo("apps/chrome-extension/src/popup/globals.css");
  const webGlobalsCss = readRepo("apps/web/src/globals.css");
  const popupCssDir = path.join(repoRoot, "apps/chrome-extension/src/popup");
  const webCssDir = path.join(repoRoot, "apps/web/src");
  const expectedUiSrc = path.join(extensionUiDir, "src");
  const expectedUiAppSrc = path.join(extensionUiDir, "app/src");
  const webUiSrc = path.join(uiDirFor("apps/web"), "src");

  function sourceRoots(css: string, fromDir: string): string[] {
    return [...css.matchAll(/@source "([^"]+)"/g)].map((match) => {
      const rel = match[1].replace(/\/\*\*\/\*.*$/, "");
      return path.resolve(fromDir, rel);
    });
  }

  const popupRoots = sourceRoots(globalsCss, popupCssDir);
  assert.equal(popupRoots.includes(expectedUiSrc), true, expectedUiSrc);
  assert.equal(popupRoots.includes(expectedUiAppSrc), true, expectedUiAppSrc);
  for (const root of popupRoots) assert.equal(existsSync(root), true, root);
  assert.equal(sourceRoots(webGlobalsCss, webCssDir).includes(webUiSrc), true);
  assert.doesNotMatch(globalsCss, /@source "\.\.\/\.\.\/node_modules\/@vv\/ui/);
});

await test("extension pages bundle the packaged Instrument Sans, not Google Fonts", () => {
  const popupHtml = readRepo(
    "apps/chrome-extension/src/entrypoints/popup/index.html",
  );
  const welcomeHtml = readRepo(
    "apps/chrome-extension/src/entrypoints/welcome.html",
  );
  const globalsCss = readRepo("apps/chrome-extension/src/popup/globals.css");
  const fontCssPath = createRequire(
    path.join(repoRoot, "apps/chrome-extension/package.json"),
  ).resolve("@vvedantb/ui/fonts/instrument-sans.css");
  const fontCss = readFileSync(fontCssPath, "utf8");
  const packageImport = /@import "@vvedantb\/ui\/fonts\/instrument-sans\.css";/;

  for (const src of [popupHtml, welcomeHtml, globalsCss, fontCss]) {
    assert.doesNotMatch(src, /https:\/\/fonts\.googleapis\.com/);
    assert.doesNotMatch(src, /https:\/\/fonts\.gstatic\.com/);
  }
  const providers = readRepo("apps/chrome-extension/src/popup/providers.tsx");
  const popupApp = readRepo("apps/chrome-extension/src/popup/App.tsx");

  assert.match(globalsCss, packageImport);
  assert.match(welcomeHtml, packageImport);
  assert.doesNotMatch(popupHtml, /\/fonts\/instrument-sans\.css/);
  assert.doesNotMatch(welcomeHtml, /href="\/fonts\//);
  assert.equal(
    existsSync(path.join(repoRoot, "apps/chrome-extension/public/fonts")),
    false,
  );
  assert.match(providers, /fontFamily: instrumentSans/);
  assert.match(popupApp, /font-sans/);
  assert.match(fontCss, /font-family:\s*"Instrument Sans"/);
  // Clerk's unlayered Inter override now ships with the package CSS
  assert.match(fontCss, /font-family: var\(--font-sans\)/);

  for (const file of [
    "InstrumentSans-latin.woff2",
    "InstrumentSans-latin-ext.woff2",
    "InstrumentSans-Italic-latin.woff2",
    "InstrumentSans-Italic-latin-ext.woff2",
    "OFL.txt",
  ]) {
    if (file.endsWith(".woff2"))
      assert.equal(fontCss.includes(file), true, file);
    assert.equal(
      existsSync(path.join(path.dirname(fontCssPath), file)),
      true,
      file,
    );
  }
});

await test("extension source never loads Google Fonts on host pages", () => {
  for (const file of extensionSourceFiles()) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(src, /fonts\.googleapis\.com/, file);
    assert.doesNotMatch(src, /fonts\.gstatic\.com/, file);
  }
});

await test("extension imports @vvedantb/ui/client or /brand, never the server/Clerk root", () => {
  for (const file of extensionSourceFiles()) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /from "@vvedantb\/ui"/,
      file,
    );
  }
});

await test("popup header uses the package AppWordmark, not a hand-built italic one", () => {
  assert.match(popupApp, /<AppWordmark app="vmem"/);
  assert.doesNotMatch(popupApp, /italic/);
  assert.doesNotMatch(popupApp, /IconVmem/);
});

await test("content scripts inline the package vmem mark, no web-accessible logo files", () => {
  const icons = readRepo("apps/chrome-extension/src/content/shared/icons.ts");
  const wxt = readRepo("apps/chrome-extension/wxt.config.ts");
  assert.match(icons, /appMarkSvg\("vmem"/);
  assert.match(icons, /from "@vvedantb\/ui\/brand"/);
  assert.doesNotMatch(icons, /getURL/);
  assert.doesNotMatch(icons, /<svg/);
  assert.doesNotMatch(wxt, /web_accessible_resources/);
  for (const file of ["icon-dark.svg", "icon-light.svg"]) {
    assert.equal(
      existsSync(path.join(repoRoot, "apps/chrome-extension/public", file)),
      false,
      file,
    );
  }
});

await test("background debug hooks are set in dev builds only", () => {
  const background = readRepo(
    "apps/chrome-extension/src/entrypoints/background.ts",
  );
  const gate = background.indexOf("if (import.meta.env.DEV) {");
  const block = background.slice(gate, background.indexOf("\n  }\n", gate));
  const assignments = background.match(/globalThis\.__vmem\w+ =/g) ?? [];
  assert.notEqual(gate, -1);
  assert.equal(assignments.length, 7);
  for (const assignment of assignments) {
    assert.equal(block.includes(assignment), true, assignment);
  }
});

await test("popup has distinct signed-out and signed-in states", () => {
  assert.match(popupApp, /Sign in to start saving memories/);
  assert.match(popupApp, /SignedOutContent/);
  assert.match(popupApp, /SignedInContent/);
  assert.match(popupApp, /when="signed-in"/);
  assert.match(popupApp, /when="signed-out"/);
  assert.match(popupApp, /QuickSave/);
  assert.match(popupApp, /ImportPanel/);
  assert.match(popupApp, /SettingsForm/);
  assert.doesNotMatch(popupApp, /Dev build:/);
});

await test("popup TokenSync does not wipe a harvested JWT when getToken returns null", () => {
  const tokenSync = readRepo(
    "apps/chrome-extension/src/popup/_components/TokenSync.tsx",
  );
  assert.match(tokenSync, /if \(active && token\)/);
  assert.doesNotMatch(tokenSync, /setAuthToken\(token \?\? ""\)/);
});

await test("popup settings do not prompt for codebase sync", () => {
  assert.equal(/codebase/i.test(settingsForm), false);
  assert.match(settingsForm, /Auto-sync history/);
});

await test("dashboard /settings/extension stays in nav and has no codebase prompts", () => {
  assert.match(navConfig, /href: "\/settings\/extension"/);
  assert.match(
    dashboardExtensionRoute,
    /createFileRoute\("\/_main\/settings\/extension"\)/,
  );
  assert.match(dashboardExtensionRoute, /ExtensionSettingsClient/);
  assert.match(dashboardExtensionPage, /extensionAutoSyncEnabled/);
  assert.match(dashboardExtensionPage, /extensionSelectionPopupEnabled/);
  assert.equal(/codebase/i.test(dashboardExtensionRoute), false);
  assert.equal(/codebase/i.test(dashboardExtensionPage), false);
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

await test("sync frequency slider maps presets to indexes and snaps legacy values", () => {
  assert.equal(syncIntervalIndex(15), 0);
  assert.equal(syncIntervalIndex(DEFAULT_SYNC_INTERVAL_MINUTES), 1);
  assert.equal(syncIntervalIndex(1440), 7);
  assert.equal(syncIntervalIndex(100), 3);
  assert.equal(syncIntervalIndex(45), 1);
  assert.equal(syncIntervalIndex(5000), 7);
  assert.equal(syncIntervalAt(3), 120);
  assert.equal(syncIntervalAt(99), DEFAULT_SYNC_INTERVAL_MINUTES);
  assert.match(settingsForm, /LabeledSliderRow/);
  assert.match(settingsForm, /onKeyDownCapture/);
  assert.match(settingsForm, /handleNativeRangeKeyDown/);
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

await test("wxt manifest maps Alt+S / Alt+Shift+S and prod Clerk host permissions", () => {
  const wxt = readRepo("apps/chrome-extension/wxt.config.ts");
  assert.match(wxt, /"save-page"/);
  assert.match(wxt, /default: "Alt\+S"/);
  assert.match(wxt, /"take-screenshot"/);
  assert.match(wxt, /default: "Alt\+Shift\+S"/);
  assert.match(wxt, /https:\/\/vmem\.projectv\.uk\/\*/);
  assert.match(wxt, /https:\/\/vmem\.vedantb\.com\/\*/);
  assert.match(wxt, /https:\/\/clerk\.projectv\.uk\/\*/);
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

await test("popup never renders blank when Clerk boot fails or is delayed", () => {
  const providers = readRepo("apps/chrome-extension/src/popup/providers.tsx");
  assert.match(providers, /getDerivedStateFromError/);
  assert.match(providers, /<BootBoundary>/);
  const html = readRepo(
    "apps/chrome-extension/src/entrypoints/popup/index.html",
  );
  assert.match(html, /id="boot"/);
  assert.match(html, /#root:empty \+ #boot/);
  assert.match(html, /Sign in to start saving memories/);
  assert.match(html, /Open vmem/);
});
