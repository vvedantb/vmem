// live signed-in matrix: cookie sync, save page, cleanup, chatgpt inject
// AI-generated (Claude), prompt: "puppeteer live e2e for vmem extension clerk cookie sync and save"
// Modified by me: env-gated credentials, Alt+S save, dashboard cleanup, never log password
import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "puppeteer-core";
import { TargetType } from "puppeteer-core";
import { z } from "zod";
import {
  artifactDir,
  ensureArtifactDir,
  launchUnpackedExtension,
  sleep,
} from "./helpers/launch-extension.mts";

declare global {
  var __vmemSaveTab: ((tab: chrome.tabs.Tab) => Promise<unknown>) | undefined;
  var __vmemHarvestToken:
    | (() => Promise<{ ok: boolean; reason: string }>)
    | undefined;
  var __vmemListMemories:
    | ((args: {
        searchQuery?: string;
        source?: string;
        limit?: number;
        offset?: number;
      }) => Promise<{
        memories: Array<{
          id: string;
          title: string;
          sourceUrl: string | null;
        }>;
        total: number;
      }>)
    | undefined;
  var __vmemGetMemory:
    | ((memoryId: string) => Promise<{
        id: string;
        title: string;
        sourceUrl: string | null;
        source: string;
      } | null>)
    | undefined;
  var __vmemDeleteMemory: ((id: string) => Promise<boolean>) | undefined;
  var __vmemAuthTokenLength: (() => Promise<number>) | undefined;
}

const email = process.env.VMEM_TEST_EMAIL ?? "";
const password = process.env.VMEM_TEST_PASSWORD ?? "";
const enabled = email.length > 0 && password.length > 0;
const marker = `vmem-ext-live-${Date.now()}`;
const saveUrl = `https://example.com/?q=${marker}`;

type Check = { ok: boolean; reason: string };

type LiveMatrix = {
  signedOutPopup: Check;
  savePageAuthError: Check;
  signedInPopup: Check;
  jwtSync: Check;
  savePage: Check & { toast?: string; memoryId?: string };
  convexMemory: Check;
  captureVisible: Check;
  cleanup: Check;
  chatgptInject: Check & { injectedExport?: boolean };
};

function emptyMatrix(reason: string): LiveMatrix {
  return {
    signedOutPopup: { ok: false, reason },
    savePageAuthError: { ok: false, reason },
    signedInPopup: { ok: false, reason },
    jwtSync: { ok: false, reason },
    savePage: { ok: false, reason },
    convexMemory: { ok: false, reason },
    captureVisible: { ok: false, reason },
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

const axPropertySchema = z.object({
  value: z.string(),
});

const axNodeSchema = z.object({
  role: axPropertySchema.optional(),
  name: axPropertySchema.optional(),
});

const axTreeSchema = z.object({
  nodes: z.array(axNodeSchema),
});

function axLabelsFromPayload(payload: unknown): string[] {
  const parsed = axTreeSchema.safeParse(payload);
  if (!parsed.success) return [];
  const labels: string[] = [];
  for (const node of parsed.data.nodes) {
    const role = node.role?.value ?? "";
    const name = node.name?.value ?? "";
    const label = `${role}:${name}`;
    if (!label.endsWith(":")) labels.push(label);
  }
  return labels;
}

async function axLabels(page: Page): Promise<string[]> {
  const client = await page.createCDPSession();
  try {
    const payload: unknown = await client.send("Accessibility.getFullAXTree");
    return axLabelsFromPayload(payload);
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

const networkCookieSchema = z.object({
  name: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.string().optional(),
  session: z.boolean().optional(),
  value: z.string().optional(),
});

const networkCookieJarSchema = z.object({
  cookies: z.array(networkCookieSchema),
});

type CookieSlice = {
  name: string;
  domain: string;
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  session: boolean;
  valueLength: number;
};

function cookieSlicesFromPayload(payload: unknown): CookieSlice[] {
  const parsed = networkCookieJarSchema.safeParse(payload);
  if (!parsed.success) return [];
  const slices: CookieSlice[] = [];
  for (const cookie of parsed.data.cookies) {
    if (
      !cookie.name.startsWith("__client") &&
      !cookie.name.startsWith("__session") &&
      !cookie.name.startsWith("__clerk")
    ) {
      continue;
    }
    slices.push({
      name: cookie.name,
      domain: cookie.domain ?? "",
      path: cookie.path ?? "",
      httpOnly: cookie.httpOnly === true,
      secure: cookie.secure === true,
      sameSite: cookie.sameSite ?? "",
      session: cookie.session === true,
      valueLength: cookie.value?.length ?? 0,
    });
  }
  return slices;
}

async function listSessionCookies(page: Page): Promise<CookieSlice[]> {
  const client = await page.createCDPSession();
  try {
    const payload: unknown = await client.send("Network.getAllCookies");
    return cookieSlicesFromPayload(payload);
  } finally {
    await client.detach().catch(() => {});
  }
}

const savePageOutcomeSchema = z.object({
  success: z.boolean(),
  memoryId: z.string().optional(),
  error: z.string().optional(),
  url: z.string().optional(),
});

type SavePageOutcome = z.infer<typeof savePageOutcomeSchema>;

const savePageSwPayloadSchema = z.object({
  url: z.string().optional(),
  result: savePageOutcomeSchema.optional(),
});

function savePageOutcomeFromUnknown(value: unknown): SavePageOutcome | null {
  const nested = savePageSwPayloadSchema.safeParse(value);
  if (nested.success && nested.data.result) {
    return {
      ...nested.data.result,
      url: nested.data.result.url ?? nested.data.url,
    };
  }
  const direct = savePageOutcomeSchema.safeParse(value);
  return direct.success ? direct.data : null;
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

function popupLooksSignedOut(text: string): boolean {
  return (
    text.includes("Sign in to start saving memories") &&
    !text.includes("Import")
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
    afterContinue = await writeAxDump(
      page,
      "live_ax_after_continue_click.json",
    );
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

async function extensionWorker(
  browser: Awaited<ReturnType<typeof launchUnpackedExtension>>["browser"],
  extensionId: string,
) {
  const workerTarget = browser.targets().find((target) => {
    return (
      target.type() === TargetType.SERVICE_WORKER &&
      target.url().startsWith(`chrome-extension://${extensionId}`)
    );
  });
  const worker = await workerTarget?.worker();
  if (!worker) throw new Error("no extension service worker");
  return worker;
}

async function closeWelcomeTabs(
  worker: Awaited<ReturnType<typeof extensionWorker>>,
): Promise<void> {
  await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url?.includes("welcome.html")) {
        await chrome.tabs.remove(tab.id);
      }
    }
  });
}

const harvestResultSchema = z.object({
  ok: z.boolean(),
  reason: z.string(),
});

const memoryGetSchema = z.object({
  id: z.string(),
  title: z.string(),
  sourceUrl: z.string().nullable().optional(),
  source: z.string().optional(),
});

async function saveExampleTab(
  worker: Awaited<ReturnType<typeof extensionWorker>>,
): Promise<string> {
  return worker.evaluate(async () => {
    const saveTab = globalThis.__vmemSaveTab;
    if (typeof saveTab !== "function") return "no save hook";
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url?.includes("welcome.html")) {
        await chrome.tabs.remove(tab.id);
      }
    }
    const example = (await chrome.tabs.query({})).find((tab) =>
      tab.url?.includes("example.com"),
    );
    if (!example?.id) {
      const urls = (await chrome.tabs.query({})).map((tab) => tab.url);
      return `no example tab: ${urls.join(",")}`;
    }
    const result: unknown = await saveTab(example);
    return JSON.stringify({ url: example.url, result });
  });
}

async function runLive(): Promise<LiveMatrix> {
  const matrix = emptyMatrix("not run");
  await ensureArtifactDir();
  const { browser, extensionId } = await launchUnpackedExtension();

  try {
    const worker = await extensionWorker(browser, extensionId);
    await closeWelcomeTabs(worker);

    const signedOutPopup = await openPopup(browser, extensionId);
    const signedOutText = await signedOutPopup.evaluate(
      () => document.body.innerText,
    );
    await screenshot(signedOutPopup, "live_popup_signed_out.png");
    matrix.signedOutPopup = {
      ok: popupLooksSignedOut(signedOutText),
      reason: popupLooksSignedOut(signedOutText)
        ? "popup shows signed-out copy"
        : `popup copy: ${signedOutText.slice(0, 180)}`,
    };
    await signedOutPopup.close().catch(() => {});

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(saveUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await page.bringToFront();
    const unauthRaw = await saveExampleTab(worker);
    const unauth = savePageOutcomeFromUnknown(
      (() => {
        try {
          return JSON.parse(unauthRaw) as unknown;
        } catch {
          return { success: false, error: unauthRaw };
        }
      })(),
    );
    const unauthError = unauth?.error ?? unauthRaw;
    matrix.savePageAuthError = {
      ok: /not authenticated/i.test(unauthError),
      reason: /not authenticated/i.test(unauthError)
        ? "save-page rejected without a Convex JWT"
        : `expected auth error, got ${unauthRaw.slice(0, 240)}`,
    };

    const web = await browser.newPage();
    try {
      await signInOnVmem(web);
      await screenshot(web, "live_web_signed_in.png");
    } catch (err) {
      await screenshot(web, "live_web_sign_in_failed.png");
      const reason = err instanceof Error ? err.message : String(err);
      matrix.signedInPopup = { ok: false, reason: `sign-in failed: ${reason}` };
      matrix.jwtSync = { ok: false, reason: `sign-in failed: ${reason}` };
      return matrix;
    }

    const sessionCookies = await listSessionCookies(web);
    await writeFile(
      path.join(artifactDir, "live_cookies.json"),
      JSON.stringify(sessionCookies, null, 2),
    );
    await sleep(1_500);

    const harvestRaw = await worker.evaluate(async () => {
      const run = globalThis.__vmemHarvestToken;
      if (typeof run !== "function") {
        return JSON.stringify({ ok: false, reason: "no harvest hook" });
      }
      return JSON.stringify(await run());
    });
    const harvest = harvestResultSchema.safeParse(
      (() => {
        try {
          return JSON.parse(harvestRaw) as unknown;
        } catch {
          return { ok: false, reason: harvestRaw };
        }
      })(),
    );
    let tokenLength = 0;
    const tokenDeadline = Date.now() + 12_000;
    while (Date.now() < tokenDeadline) {
      tokenLength = await worker
        .evaluate(async () => {
          const read = globalThis.__vmemAuthTokenLength;
          return typeof read === "function" ? await read() : 0;
        })
        .catch(() => 0);
      if (tokenLength > 40) break;
      await sleep(400);
    }
    matrix.jwtSync = {
      ok: tokenLength > 40,
      reason:
        tokenLength > 40
          ? `session:authToken length=${tokenLength}; harvest=${harvest.success ? harvest.data.reason : harvestRaw}`
          : `token missing after harvest=${harvestRaw}; cookies=${JSON.stringify(sessionCookies)}`,
    };

    const popup = await openPopup(browser, extensionId);
    let popupText = await popup.evaluate(() => document.body.innerText);
    const signedInDeadline = Date.now() + 15_000;
    while (
      Date.now() < signedInDeadline &&
      !popupLooksSignedIn(popupText) &&
      !popupText.includes("Sign in to start saving memories")
    ) {
      await sleep(500);
      popupText = await popup
        .evaluate(() => document.body.innerText)
        .catch(() => popupText);
    }
    const cookieProbe = await popupCookieProbe(popup).catch(() => ({
      vmemClient: null,
      clerkClient: null,
      vmemSession: null,
    }));
    const signedIn = popupLooksSignedIn(popupText);
    const cookieSync = cookieProbe.clerkClient
      ? "native-fapi"
      : cookieProbe.vmemClient
        ? "native-web"
        : "missing";
    await screenshot(popup, "live_popup_signed_in.png");
    matrix.signedInPopup = {
      ok: signedIn,
      reason: signedIn
        ? `popup shows Save / Import tabs (${cookieSync}); chrome.cookies __client vmem=${cookieProbe.vmemClient} clerk=${cookieProbe.clerkClient}`
        : `popup copy: ${popupText.slice(0, 180)}; cookies=${JSON.stringify(sessionCookies)}; probe=${JSON.stringify(cookieProbe)}`,
    };
    await popup.close().catch(() => {});

    await page.bringToFront();
    await sleep(300);
    const toastWait = page
      .waitForFunction(
        () =>
          /Page saved to vmem|Failed to save page/.test(
            document.body.innerText,
          ),
        { timeout: 25_000 },
      )
      .then(() => true)
      .catch(() => false);
    const swResult = await saveExampleTab(worker).catch((err: unknown) =>
      err instanceof Error ? err.message : String(err),
    );
    const swToast = await toastWait;
    const pageText = await page.evaluate(() => document.body.innerText);
    const parsed = (() => {
      try {
        return savePageOutcomeFromUnknown(JSON.parse(swResult) as unknown);
      } catch {
        return null;
      }
    })();
    const saveOk = Boolean(parsed?.success && parsed.memoryId);
    await screenshot(page, "live_save_toast.png");
    matrix.savePage = {
      ok: saveOk,
      memoryId: parsed?.memoryId,
      reason: saveOk
        ? `save-page memoryId=${parsed?.memoryId}`
        : `sw=${swResult}; toast=${swToast ? pageText.slice(0, 120) : "none"}`,
      toast: pageText.includes("Page saved to vmem")
        ? "✓ Page saved to vmem"
        : pageText.includes("Failed to save page")
          ? "✗ Failed to save page"
          : undefined,
    };

    const captureRaw = await worker.evaluate(async () => {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
        return JSON.stringify({
          ok: dataUrl.startsWith("data:image/png"),
          length: dataUrl.length,
        });
      } catch (err) {
        return JSON.stringify({
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    });
    const capture = z
      .object({
        ok: z.boolean(),
        length: z.number().optional(),
        reason: z.string().optional(),
      })
      .safeParse(
        (() => {
          try {
            return JSON.parse(captureRaw) as unknown;
          } catch {
            return { ok: false, reason: captureRaw };
          }
        })(),
      );
    matrix.captureVisible = {
      ok: capture.success && capture.data.ok === true,
      reason:
        capture.success && capture.data.ok
          ? `png ${capture.data.length ?? 0} bytes`
          : `capture failed: ${capture.success ? (capture.data.reason ?? "not png") : captureRaw}`,
    };

    if (saveOk && parsed?.memoryId) {
      const fetchedRaw = await worker.evaluate(async (memoryId) => {
        const get = globalThis.__vmemGetMemory;
        if (typeof get !== "function") return "no get hook";
        try {
          const memory = await get(memoryId);
          if (!memory) return JSON.stringify(null);
          return JSON.stringify({
            id: memory.id,
            title: memory.title,
            sourceUrl: memory.sourceUrl,
            source: memory.source,
          });
        } catch (err) {
          return `get failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }, parsed.memoryId);
      const fetched = memoryGetSchema.safeParse(
        (() => {
          try {
            return JSON.parse(fetchedRaw) as unknown;
          } catch {
            return null;
          }
        })(),
      );
      const found =
        fetched.success &&
        fetched.data.id === parsed.memoryId &&
        (fetched.data.sourceUrl?.includes(marker) === true ||
          fetched.data.title.includes("Example Domain"));
      matrix.convexMemory = {
        ok: Boolean(found),
        reason: found
          ? `Convex getMemory ${parsed.memoryId} title=${fetched.success ? fetched.data.title : ""} sourceUrl=${fetched.success ? (fetched.data.sourceUrl ?? "") : ""}`
          : `get=${fetchedRaw.slice(0, 280)}`,
      };

      const deletedRaw = await worker.evaluate(async (memoryId) => {
        const remove = globalThis.__vmemDeleteMemory;
        if (typeof remove !== "function") return "no delete hook";
        try {
          return JSON.stringify({ ok: await remove(memoryId) });
        } catch (err) {
          return `delete failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      }, parsed.memoryId);
      const deleted = (() => {
        try {
          const parsedDelete: unknown = JSON.parse(deletedRaw);
          return z.object({ ok: z.boolean() }).safeParse(parsedDelete);
        } catch {
          return { success: false as const };
        }
      })();
      matrix.cleanup = {
        ok: deleted.success && deleted.data.ok,
        reason:
          deleted.success && deleted.data.ok
            ? "Convex deleteMemory removed the test row"
            : deletedRaw,
      };
    } else {
      matrix.convexMemory = {
        ok: false,
        reason: "skipped — save-page did not return a memoryId",
      };
      matrix.cleanup = {
        ok: false,
        reason: "skipped — nothing to delete",
      };
    }

    await writeFile(
      path.join(artifactDir, "live_matrix.json"),
      JSON.stringify({ marker, email, matrix }, null, 2),
    );

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
        ok:
          chatgptProbe.hasExport ||
          chatgptProbe.hasUse ||
          chatgptProbe.hasUseCopy,
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
  "popup starts signed-out before the web session exists",
  {
    skip: !enabled,
  },
  () => {
    assert.equal(matrix.signedOutPopup.ok, true, matrix.signedOutPopup.reason);
  },
);

await test(
  "save-page fails closed without a Convex JWT",
  { skip: !enabled },
  () => {
    assert.equal(
      matrix.savePageAuthError.ok,
      true,
      matrix.savePageAuthError.reason,
    );
  },
);

await test(
  "extension popup syncs Clerk session from the web app cookie",
  { skip: !enabled },
  () => {
    assert.equal(matrix.signedInPopup.ok, true, matrix.signedInPopup.reason);
  },
);

await test(
  "web Clerk session mints a Convex JWT into the extension",
  {
    skip: !enabled,
  },
  () => {
    assert.equal(matrix.jwtSync.ok, true, matrix.jwtSync.reason);
  },
);

await test("save-page creates a Convex memory", { skip: !enabled }, () => {
  assert.equal(matrix.savePage.ok, true, matrix.savePage.reason);
});

await test(
  "saved memory is visible via Convex getMemory",
  {
    skip: !enabled,
  },
  () => {
    assert.equal(matrix.convexMemory.ok, true, matrix.convexMemory.reason);
  },
);

await test(
  "captureVisibleTab returns a png from the example page",
  {
    skip: !enabled,
  },
  () => {
    assert.equal(matrix.captureVisible.ok, true, matrix.captureVisible.reason);
  },
);

await test("test memory is deleted after the run", { skip: !enabled }, () => {
  assert.equal(matrix.cleanup.ok, true, matrix.cleanup.reason);
});

await test("ChatGPT inject probe recorded a result", { skip: !enabled }, () => {
  assert.ok(matrix.chatgptInject.reason.length > 0);
});
