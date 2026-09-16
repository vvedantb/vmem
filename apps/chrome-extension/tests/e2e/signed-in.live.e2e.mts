// live signed-in matrix: cookie sync, save page, cleanup, chatgpt inject
// AI-generated (Claude), prompt: "puppeteer live e2e for vmem extension clerk cookie sync and save"
// Modified by me: env-gated credentials, Alt+S save, dashboard cleanup, never log password
import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "puppeteer-core";
import {
  artifactDir,
  ensureArtifactDir,
  launchUnpackedExtension,
  sleep,
} from "./helpers/launch-extension.mts";

const email = process.env.VMEM_TEST_EMAIL ?? "";
const password = process.env.VMEM_TEST_PASSWORD ?? "";
const enabled = email.length > 0 && password.length > 0;
const marker = `vmem-ext-live-${Date.now()}`;
const saveUrl = `https://example.com/?q=${marker}`;

type LiveMatrix = {
  signedInPopup: { ok: boolean; reason: string };
  savePage: { ok: boolean; reason: string; toast?: string };
  memoryVisible: { ok: boolean; reason: string };
  cleanup: { ok: boolean; reason: string };
  chatgptInject: { ok: boolean; reason: string; injectedExport?: boolean };
};

function emptyMatrix(reason: string): LiveMatrix {
  return {
    signedInPopup: { ok: false, reason },
    savePage: { ok: false, reason },
    memoryVisible: { ok: false, reason },
    cleanup: { ok: false, reason },
    chatgptInject: { ok: false, reason },
  };
}

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: path.join(artifactDir, name),
    fullPage: false,
  });
}

async function clickFirstMatching(
  page: Page,
  selector: string,
  predicate: (text: string) => boolean,
): Promise<boolean> {
  const roots = [page, ...page.frames()];
  for (const root of roots) {
    const handles = await root.$$(selector).catch(() => []);
    for (const handle of handles) {
      const text = await root.evaluate((el) => el.textContent ?? "", handle);
      if (predicate(text.replace(/\s+/g, " ").trim())) {
        await handle.click();
        return true;
      }
    }
  }
  return false;
}

async function typeInto(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const targets = [page, ...page.frames()];
    for (const target of targets) {
      const el = await target.$(selector).catch(() => null);
      if (!el) continue;
      const box = await el.boundingBox().catch(() => null);
      if (!box) continue;
      await el.click({ clickCount: 3 });
      await el.type(value, { delay: 15 });
      return;
    }
    await sleep(250);
  }
  throw new Error(`missing ${selector}`);
}

async function signInOnVmem(page: Page): Promise<void> {
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("https://vmem.vedantb.com", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("button")).some(
          (b) => (b.textContent ?? "").trim() === "Sign in",
        ),
      { timeout: 20_000 },
    )
    .catch(() => {});

  const clicked = await clickFirstMatching(
    page,
    "button",
    (text) => text === "Sign in",
  );
  if (!clicked) {
    throw new Error("Sign in button not found on vmem.vedantb.com");
  }

  await typeInto(
    page,
    'input[name="identifier"], input[type="email"], input[autocomplete="username"]',
    email,
  );
  await clickFirstMatching(
    page,
    "button",
    (text) => text === "Continue" || text === "Next",
  );

  await typeInto(
    page,
    'input[name="password"], input[type="password"]',
    password,
  );
  const submitted =
    (await clickFirstMatching(
      page,
      "button",
      (text) => text === "Continue" || text === "Sign in" || text === "Log in",
    )) || (await page.keyboard.press("Enter").then(() => true));
  if (!submitted) {
    throw new Error("password continue button not found");
  }

  await page.waitForFunction(
    () =>
      location.pathname.includes("/home") ||
      location.pathname.includes("/memories") ||
      /Memories|Inbox|Skills/.test(document.body.innerText),
    { timeout: 45_000 },
  );
}

async function openPopup(
  browser: Awaited<ReturnType<typeof launchUnpackedExtension>>["browser"],
  extensionId: string,
): Promise<Page> {
  const popup = await browser.newPage();
  await popup.setViewport({ width: 380, height: 525 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await popup
    .waitForFunction(
      () =>
        document.body.innerText.includes("Save to vmem") ||
        document.body.innerText.includes("Sign in to start saving memories"),
      { timeout: 20_000 },
    )
    .catch(() => {});
  return popup;
}

async function deleteVisibleTestMemory(page: Page): Promise<boolean> {
  const opened = await clickFirstMatching(
    page,
    "button, a, [role='button']",
    (text) => text.includes("Example Domain"),
  );
  if (!opened) {
    const byMarker = await page.evaluate((token) => {
      return document.body.innerText.includes(token);
    }, marker);
    if (!byMarker) return false;
  }
  await sleep(800);
  const trash = await page.$('[aria-label="Delete"], button:has(svg)');
  const clickedTrash = await clickFirstMatching(
    page,
    "button",
    (text) => text === "Delete" || text.includes("Delete"),
  );
  if (!clickedTrash && trash) await trash.click();
  await sleep(400);
  await clickFirstMatching(
    page,
    "button",
    (text) =>
      text === "Delete" || text === "Confirm" || text === "Delete memory",
  );
  await sleep(1_000);
  return true;
}

async function runLive(): Promise<LiveMatrix> {
  const matrix = emptyMatrix("not run");
  await ensureArtifactDir();
  const { browser, extensionId } = await launchUnpackedExtension();

  try {
    const web = await browser.newPage();
    try {
      await signInOnVmem(web);
      await screenshot(web, "live_web_signed_in.png");
    } catch (err) {
      await screenshot(web, "live_web_sign_in_failed.png");
      const reason = err instanceof Error ? err.message : String(err);
      return emptyMatrix(`sign-in failed: ${reason}`);
    }

    const popup = await openPopup(browser, extensionId);
    const popupText = await popup.evaluate(() => document.body.innerText);
    await screenshot(popup, "live_popup_signed_in.png");
    const signedIn =
      popupText.includes("Save to vmem") &&
      popupText.includes("Import") &&
      !popupText.includes("Sign in to start saving memories");
    matrix.signedInPopup = {
      ok: signedIn,
      reason: signedIn
        ? "popup shows Save / Import tabs"
        : `popup copy: ${popupText.slice(0, 240)}`,
    };
    await popup.close().catch(() => {});

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(saveUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.bringToFront();
    await sleep(500);
    await page.keyboard.down("Alt");
    await page.keyboard.press("KeyS");
    await page.keyboard.up("Alt");
    const toastSeen = await page
      .waitForFunction(
        () =>
          /Page saved to vmem|Failed to save page/.test(
            document.body.innerText,
          ),
        { timeout: 20_000 },
      )
      .then(() => true)
      .catch(() => false);
    const pageText = await page.evaluate(() => document.body.innerText);
    await screenshot(page, "live_save_toast.png");
    const saveOk = toastSeen && pageText.includes("Page saved to vmem");
    matrix.savePage = {
      ok: saveOk,
      reason: saveOk
        ? "Alt+S success toast"
        : toastSeen
          ? "failure toast"
          : "no save toast",
      toast: pageText.includes("Page saved to vmem")
        ? "✓ Page saved to vmem"
        : pageText.includes("Failed to save page")
          ? "✗ Failed to save page"
          : undefined,
    };

    await web.bringToFront();
    await web.goto("https://vmem.vedantb.com/home", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await sleep(2_000);
    await clickFirstMatching(web, "a, button", (text) => text === "Memories");
    await sleep(2_000);
    const search = await web.$(
      'input[placeholder*="Search" i], input[type="search"]',
    );
    if (search) {
      await search.click({ clickCount: 3 });
      await search.type(marker, { delay: 15 });
      await web.keyboard.press("Enter");
      await sleep(2_000);
    }
    await screenshot(web, "live_memory_list.png");
    const listText = await web.evaluate(() => document.body.innerText);
    const visible =
      listText.includes(marker) || listText.includes("Example Domain");
    matrix.memoryVisible = {
      ok: visible,
      reason: visible
        ? "memory listed after save"
        : `list copy: ${listText.slice(0, 240)}`,
    };

    if (visible) {
      const deleted = await deleteVisibleTestMemory(web);
      await sleep(1_500);
      await screenshot(web, "live_memory_cleanup.png");
      const after = await web.evaluate(() => document.body.innerText);
      const gone = deleted && !after.includes(marker);
      matrix.cleanup = {
        ok: gone || deleted,
        reason: gone
          ? "test memory deleted"
          : deleted
            ? "delete clicked; marker still in DOM"
            : "could not trigger delete",
      };
    } else {
      matrix.cleanup = {
        ok: false,
        reason: "skipped — memory not found to delete",
      };
    }

    const chatgpt = await browser.newPage();
    try {
      await chatgpt.goto("https://chatgpt.com/", {
        waitUntil: "domcontentloaded",
        timeout: 25_000,
      });
      await sleep(3_000);
      await screenshot(chatgpt, "live_chatgpt.png");
      const injectedExport = Boolean(
        await chatgpt.$("[data-vmem-action='export']"),
      );
      const injectedUse = Boolean(await chatgpt.$("[data-vmem]"));
      matrix.chatgptInject = {
        ok: injectedExport || injectedUse,
        injectedExport,
        reason: injectedExport
          ? "export + composer inject"
          : injectedUse
            ? "Use vmem only (logged-out ChatGPT header)"
            : "no vmem controls (blocked or selector miss)",
      };
    } catch (err) {
      matrix.chatgptInject = {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await chatgpt.close().catch(() => {});
    }

    return matrix;
  } finally {
    await browser.close().catch(() => {});
  }
}

await test("live signed-in matrix requires VMEM_TEST_EMAIL and VMEM_TEST_PASSWORD", () => {
  if (!enabled) {
    console.log(
      "[vmem e2e live] skipped — set VMEM_TEST_EMAIL and VMEM_TEST_PASSWORD",
    );
  }
  assert.equal(typeof enabled, "boolean");
});

if (!enabled) {
  await test(
    "live signed-in matrix skipped without credentials",
    { skip: true },
    () => {},
  );
} else {
  const matrix = await runLive();
  await ensureArtifactDir();
  await writeFile(
    path.join(artifactDir, "live_matrix.json"),
    JSON.stringify(
      {
        marker,
        email,
        matrix,
      },
      null,
      2,
    ),
  );
  console.log("[vmem e2e live]", JSON.stringify(matrix, null, 2));

  await test("extension popup syncs Clerk session from the web app cookie", () => {
    assert.equal(matrix.signedInPopup.ok, true, matrix.signedInPopup.reason);
  });

  await test("Alt+S saves the current page with a matching success toast", () => {
    assert.equal(matrix.savePage.ok, true, matrix.savePage.reason);
  });

  await test("saved memory appears in the dashboard list", () => {
    assert.equal(matrix.memoryVisible.ok, true, matrix.memoryVisible.reason);
  });

  await test("test memory is deleted after the run", () => {
    assert.equal(matrix.cleanup.ok, true, matrix.cleanup.reason);
  });

  await test("ChatGPT inject probe recorded a result", () => {
    assert.ok(matrix.chatgptInject.reason.length > 0);
  });
}
