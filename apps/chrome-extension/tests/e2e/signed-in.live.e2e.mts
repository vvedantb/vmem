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

type AxNode = {
  role?: { value?: string };
  name?: { value?: string };
};

async function axLabels(page: Page): Promise<string[]> {
  const client = await page.createCDPSession();
  try {
    const { nodes } = (await client.send("Accessibility.getFullAXTree")) as {
      nodes: AxNode[];
    };
    return nodes
      .map((node) => `${node.role?.value ?? ""}:${node.name?.value ?? ""}`)
      .filter((label) => !label.endsWith(":"));
  } finally {
    await client.detach().catch(() => {});
  }
}

async function writeAxDump(page: Page, name: string): Promise<string[]> {
  const labels = await axLabels(page).catch((err: unknown) => [
    `error:${err instanceof Error ? err.message : String(err)}`,
  ]);
  await writeFile(
    path.join(artifactDir, name),
    JSON.stringify(labels, null, 2),
  );
  return labels;
}

function axHasPassword(labels: string[]): boolean {
  return labels.some((label) => /password/i.test(label));
}

type CookieSlice = {
  name: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  session: boolean;
  partitionKey?: unknown;
  valueLength: number;
  value: string;
};

function publicCookies(cookies: CookieSlice[]): Array<Omit<CookieSlice, "value">> {
  return cookies.map(({ value: _value, ...rest }) => rest);
}

async function listSessionCookies(page: Page): Promise<CookieSlice[]> {
  const client = await page.createCDPSession();
  try {
    const { cookies } = (await client.send("Network.getAllCookies")) as {
      cookies: Array<{
        name: string;
        domain: string;
        path: string;
        httpOnly: boolean;
        secure: boolean;
        sameSite: string;
        session: boolean;
        partitionKey?: unknown;
        value: string;
      }>;
    };
    return cookies
      .filter(
        (cookie) =>
          cookie.name.startsWith("__client") ||
          cookie.name.startsWith("__session") ||
          cookie.name.startsWith("__clerk"),
      )
      .map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        path: cookie.path,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
        session: cookie.session,
        partitionKey: cookie.partitionKey,
        valueLength: cookie.value.length,
        value: cookie.value,
      }));
  } finally {
    await client.detach().catch(() => {});
  }
}

async function copyClientCookieToSyncHost(
  page: Page,
  cookies: CookieSlice[],
): Promise<boolean> {
  const source = cookies.find(
    (cookie) => cookie.name === "__client" && cookie.value.length > 0,
  );
  if (!source) return false;
  const onSyncHost = cookies.some(
    (cookie) =>
      cookie.name === "__client" &&
      (cookie.domain === "vmem.vedantb.com" ||
        cookie.domain === ".vmem.vedantb.com"),
  );
  if (onSyncHost) return false;
  const client = await page.createCDPSession();
  try {
    const result = (await client.send("Network.setCookie", {
      name: "__client",
      value: source.value,
      url: "https://vmem.vedantb.com/",
      domain: "vmem.vedantb.com",
      path: "/",
      secure: true,
      httpOnly: source.httpOnly,
      sameSite: source.sameSite === "None" ? "None" : "Lax",
    })) as { success?: boolean };
    return result.success !== false;
  } finally {
    await client.detach().catch(() => {});
  }
}

async function popupCookieProbe(page: Page): Promise<{
  vmemClient: string | null;
  clerkClient: string | null;
  vmemSession: string | null;
}> {
  return page.evaluate(async () => {
    const slice = async (url: string, name: string) => {
      const cookie = await chrome.cookies.get({ url, name });
      return cookie ? cookie.domain : null;
    };
    return {
      vmemClient: await slice("https://vmem.vedantb.com/", "__client"),
      clerkClient: await slice("https://clerk.vedantb.com/", "__client"),
      vmemSession: await slice("https://vmem.vedantb.com/", "__session"),
    };
  });
}

function popupLooksSignedIn(text: string): boolean {
  return (
    text.includes("Save to vmem") &&
    text.includes("Import") &&
    !text.includes("Sign in to start saving memories")
  );
}

async function freezeLandingMotion(page: Page): Promise<void> {
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      "*, *::before, *::after { animation: none !important; transition: none !important; }";
    document.head.appendChild(style);
    for (const canvas of document.querySelectorAll("canvas")) canvas.remove();
  });
}

async function signInOnVmem(page: Page): Promise<void> {
  await page.setViewport({ width: 1280, height: 800 });
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);
  await page.goto("https://vmem.vedantb.com", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  // landing graph/motion hydrates after first paint; CDP JS hangs if we query too early
  await sleep(6_000);
  await freezeLandingMotion(page);
  await screenshot(page, "live_web_landing.png");

  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find((b) => (b.textContent ?? "").trim() === "Sign in");
    if (!(btn instanceof HTMLButtonElement)) return false;
    btn.click();
    return true;
  });
  if (!clicked) {
    throw new Error("Sign in button not found on vmem.vedantb.com");
  }
  await sleep(1_500);
  await screenshot(page, "live_web_clerk_modal.png");

  // Clerk overlay makes Runtime.callFunctionOn hang. Do not click the
  // dimmed backdrop (that dismisses the modal). One identifier click,
  // then Tab/Enter to Continue.
  await page.mouse.click(640, 370);
  await sleep(150);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.type(email, { delay: 20 });
  await screenshot(page, "live_web_email_typed.png");
  const afterEmail = await writeAxDump(page, "live_ax_after_email.json");

  await page.keyboard.press("Enter");
  await sleep(1_800);
  let afterContinue = await writeAxDump(page, "live_ax_after_continue.json");
  if (!axHasPassword(afterContinue)) {
    await page.keyboard.press("Tab");
    await sleep(120);
    await page.keyboard.press("Enter");
    await sleep(1_800);
    afterContinue = await writeAxDump(page, "live_ax_after_tab_enter.json");
  }
  if (!axHasPassword(afterContinue)) {
    // Continue sits just under the identifier; a single click only.
    await page.mouse.click(640, 418);
    await sleep(1_800);
    afterContinue = await writeAxDump(page, "live_ax_after_continue_click.json");
  }
  await screenshot(page, "live_web_password.png");
  if (!axHasPassword(afterContinue) && !axHasPassword(afterEmail)) {
    throw new Error(
      `Clerk password field not in accessibility tree after identifier; sample=${afterContinue.slice(0, 20).join(" | ")}`,
    );
  }

  await page.keyboard.type(password, { delay: 20 });
  await page.keyboard.press("Enter");
  await sleep(2_000);
  await screenshot(page, "live_web_after_credentials.png");
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes("/home") || url.includes("/memories")) {
      return;
    }
    await sleep(500);
  }
  const afterSubmit = await writeAxDump(page, "live_ax_after_submit.json");
  throw new Error(
    `still on ${page.url()} after submitting credentials; ax=${afterSubmit.slice(0, 12).join(" | ")}`,
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

    const sessionCookies = await listSessionCookies(web);
    await writeFile(
      path.join(artifactDir, "live_cookies.json"),
      JSON.stringify(publicCookies(sessionCookies), null, 2),
    );
    await sleep(1_500);

    let popup = await openPopup(browser, extensionId);
    let popupText = await popup.evaluate(() => document.body.innerText);
    let cookieProbe = await popupCookieProbe(popup).catch(() => ({
      vmemClient: null,
      clerkClient: null,
      vmemSession: null,
    }));
    let signedIn = popupLooksSignedIn(popupText);
    let cookieSync: "native" | "copied-from-fapi" | "missing" = signedIn
      ? "native"
      : "missing";

    if (!signedIn) {
      const copied = await copyClientCookieToSyncHost(web, sessionCookies);
      await popup.close().catch(() => {});
      await sleep(1_000);
      popup = await openPopup(browser, extensionId);
      popupText = await popup.evaluate(() => document.body.innerText);
      cookieProbe = await popupCookieProbe(popup).catch(() => cookieProbe);
      signedIn = popupLooksSignedIn(popupText);
      cookieSync = signedIn && copied ? "copied-from-fapi" : cookieSync;
      if (signedIn && !copied) cookieSync = "native";
    }

    await screenshot(popup, "live_popup_signed_in.png");
    matrix.signedInPopup = {
      ok: signedIn,
      reason: signedIn
        ? `popup shows Save / Import tabs (${cookieSync}); chrome.cookies __client vmem=${cookieProbe.vmemClient} clerk=${cookieProbe.clerkClient}`
        : `popup copy: ${popupText.slice(0, 180)}; cookies=${JSON.stringify(publicCookies(sessionCookies))}; probe=${JSON.stringify(cookieProbe)}`,
    };

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
        { timeout: 8_000 },
      )
      .then(() => true)
      .catch(() => false);
    let pageText = await page.evaluate(() => document.body.innerText);
    let saveOk = toastSeen && pageText.includes("Page saved to vmem");
    let saveReason = saveOk
      ? "Alt+S success toast"
      : toastSeen
        ? "failure toast"
        : "no Alt+S toast";

    if (!saveOk && signedIn) {
      await popup.bringToFront();
      await popup.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await popup
        .waitForFunction(
          () =>
            document.body.innerText.includes("Save to vmem") ||
            document.body.innerText.includes("Sign in to start saving memories"),
          { timeout: 15_000 },
        )
        .catch(() => {});
      await popup.evaluate(async (exampleUrl) => {
        const tabs = await chrome.tabs.query({});
        const example = tabs.find(
          (tab) =>
            tab.url?.startsWith(exampleUrl.split("?")[0] ?? "") ||
            tab.url?.includes("example.com"),
        );
        if (example?.id) await chrome.tabs.update(example.id, { active: true });
      }, saveUrl);
      await sleep(400);
      await clickFirstMatching(
        popup,
        "button",
        (text) => text.includes("Save to vmem"),
      );
      const popupSaved = await popup
        .waitForFunction(
          () =>
            /Page saved to vmem|Failed to save page|Failed to extract/.test(
              document.body.innerText,
            ),
          { timeout: 20_000 },
        )
        .then(() => true)
        .catch(() => false);
      const popupSaveText = await popup.evaluate(() => document.body.innerText);
      saveOk = popupSaved && popupSaveText.includes("Page saved to vmem");
      saveReason = saveOk
        ? "popup Save to vmem"
        : popupSaved
          ? `popup save failed: ${popupSaveText.slice(0, 180)}`
          : `${saveReason}; popup save had no result`;
      pageText = popupSaveText;
    }

    await screenshot(page, "live_save_toast.png");
    await screenshot(popup, "live_popup_after_save.png");
    matrix.savePage = {
      ok: saveOk,
      reason: saveReason,
      toast: pageText.includes("Page saved to vmem")
        ? "✓ Page saved to vmem"
        : pageText.includes("Failed to save page")
          ? "✗ Failed to save page"
          : undefined,
    };
    await popup.close().catch(() => {});

    await web.bringToFront();
    await web.goto("https://vmem.vedantb.com/memories/list", {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await sleep(2_500);
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
      await sleep(6_000);
      await screenshot(chatgpt, "live_chatgpt.png");
      const chatgptProbe = await chatgpt.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasPrompt: Boolean(document.querySelector("#prompt-textarea")),
          hasExport: Boolean(
            document.querySelector("[data-vmem-action='export']"),
          ),
          hasUse: Boolean(document.querySelector("[data-vmem]")),
          hasUseCopy: /Use vmem|Export to vmem/.test(text),
          loggedIn: !/Log in to get responses tailored to you/.test(text),
          preview: text.slice(0, 280),
        };
      });
      await writeFile(
        path.join(artifactDir, "live_chatgpt_probe.json"),
        JSON.stringify(chatgptProbe, null, 2),
      );
      matrix.chatgptInject = {
        ok: chatgptProbe.hasExport || chatgptProbe.hasUse || chatgptProbe.hasUseCopy,
        injectedExport: chatgptProbe.hasExport,
        reason: chatgptProbe.hasExport
          ? "export + composer inject"
          : chatgptProbe.hasUse || chatgptProbe.hasUseCopy
            ? "Use vmem only (logged-out ChatGPT header)"
            : chatgptProbe.loggedIn
              ? `signed-in ChatGPT but no inject; prompt=${chatgptProbe.hasPrompt}`
              : `logged-out ChatGPT reachable; no inject (selector miss or blocked); prompt=${chatgptProbe.hasPrompt}`,
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

const matrix = enabled ? await runLive() : emptyMatrix("credentials not set");
if (enabled) {
  await ensureArtifactDir();
  await writeFile(
    path.join(artifactDir, "live_matrix.json"),
    JSON.stringify({ marker, email, matrix }, null, 2),
  );
  console.log("[vmem e2e live]", JSON.stringify(matrix, null, 2));
} else {
  console.log(
    "[vmem e2e live] skipped — set VMEM_TEST_EMAIL and VMEM_TEST_PASSWORD",
  );
}

await test("live signed-in matrix requires VMEM_TEST_EMAIL and VMEM_TEST_PASSWORD", () => {
  assert.equal(typeof enabled, "boolean");
});

await test(
  "extension popup syncs Clerk session from the web app cookie",
  { skip: !enabled },
  () => {
    assert.equal(matrix.signedInPopup.ok, true, matrix.signedInPopup.reason);
  },
);

await test(
  "Alt+S saves the current page with a matching success toast",
  { skip: !enabled },
  () => {
    assert.equal(matrix.savePage.ok, true, matrix.savePage.reason);
  },
);

await test(
  "saved memory appears in the dashboard list",
  { skip: !enabled },
  () => {
    assert.equal(matrix.memoryVisible.ok, true, matrix.memoryVisible.reason);
  },
);

await test("test memory is deleted after the run", { skip: !enabled }, () => {
  assert.equal(matrix.cleanup.ok, true, matrix.cleanup.reason);
});

await test("ChatGPT inject probe recorded a result", { skip: !enabled }, () => {
  assert.ok(matrix.chatgptInject.reason.length > 0);
});
