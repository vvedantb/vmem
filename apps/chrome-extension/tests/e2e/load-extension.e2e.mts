// optional headed Chrome load of the unpacked MV3 build
// AI-generated (Claude), prompt: "puppeteer-core harness to load unpacked chrome-mv3 extension"
// Modified by me: puppeteer enableExtensions + pipe for chrome 137+, wait for signed-out copy
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer, { TargetType, type Page } from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(extensionRoot, "../..");
const distDir = path.join(extensionRoot, "dist/chrome-mv3");
const chromeBin =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find((bin) =>
    existsSync(bin),
  );

const artifactDir =
  process.env.VMEM_EXT_ARTIFACT_DIR ??
  (existsSync("/opt/cursor/artifacts")
    ? "/opt/cursor/artifacts"
    : path.join(extensionRoot, "tests/e2e/artifacts"));

type LoadResult = {
  ok: boolean;
  reason: string;
  extensionId?: string;
  popupPath?: string;
  targets?: string[];
};

type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistLoadResult(
  result: LoadResult,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    path.join(artifactDir, "extension_load.json"),
    JSON.stringify({ ...result, distDir, chromeBin, ...extra }, null, 2),
  );
}

async function probePage(
  browser: Browser,
  name: string,
  url: string,
  inspect: (page: Page) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await sleep(2_500);
    const details = await inspect(page);
    await page.screenshot({ path: path.join(artifactDir, `${name}.png`) });
    return { url: page.url(), title: await page.title(), ...details };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function probeLivePages(
  browser: Browser,
): Promise<Record<string, unknown>> {
  const chatgpt = await probePage(
    browser,
    "chatgpt",
    "https://chatgpt.com/",
    async (page) => ({
      injectedExport: Boolean(await page.$("[data-vmem-action='export']")),
      injectedUseVmem: Boolean(await page.$("[data-vmem]")),
      bodyPreview: (await page.evaluate(() => document.body.innerText)).slice(
        0,
        300,
      ),
    }),
  );
  const claude = await probePage(
    browser,
    "claude",
    "https://claude.ai/",
    async (page) => ({
      injectedExport: Boolean(await page.$("[data-vmem-action='export']")),
      bodyPreview: (await page.evaluate(() => document.body.innerText)).slice(
        0,
        300,
      ),
    }),
  );
  const settings = await probePage(
    browser,
    "settings_extension",
    "https://vmem.vedantb.com/settings/extension",
    async (page) => {
      const text = await page.evaluate(() => document.body.innerText);
      return {
        hasCodebasePrompt: /codebase/i.test(text),
        bodyPreview: text.slice(0, 300),
      };
    },
  );
  return { chatgpt, claude, settings };
}

async function loadUnpacked(): Promise<LoadResult> {
  if (!chromeBin) {
    const result = { ok: false, reason: "google-chrome is not installed" };
    await persistLoadResult(result);
    return result;
  }
  if (!existsSync(path.join(distDir, "manifest.json"))) {
    const result = {
      ok: false,
      reason: `unpacked build missing at ${distDir} — run pnpm ext:build`,
    };
    await persistLoadResult(result);
    return result;
  }

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "vmem-ext-"));
  let browser: Browser | undefined;

  try {
    browser = await puppeteer.launch({
      executablePath: chromeBin,
      headless: false,
      userDataDir,
      pipe: true,
      enableExtensions: [distDir],
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--enable-unsafe-extension-debugging",
      ],
    });

    const deadline = Date.now() + 20_000;
    let extensionId: string | undefined;
    let targets: string[] = [];
    while (Date.now() < deadline) {
      targets = browser.targets().map((target) => {
        return `${target.type()}:${target.url()}`;
      });
      const worker = browser.targets().find((target) => {
        return (
          target.type() === TargetType.SERVICE_WORKER &&
          target.url().startsWith("chrome-extension://")
        );
      });
      const extTarget = browser.targets().find((target) => {
        return target.url().startsWith("chrome-extension://");
      });
      const url = worker?.url() ?? extTarget?.url();
      if (url) {
        extensionId = new URL(url).hostname;
        break;
      }
      await sleep(250);
    }

    if (!extensionId) {
      const result = {
        ok: false,
        reason:
          "Chrome launched but no chrome-extension:// target appeared (MV3 load-extension blocked in this environment)",
        targets,
      };
      await persistLoadResult(result);
      return result;
    }

    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const page = await browser.newPage();
    await page.setViewport({ width: 380, height: 525 });
    await page.goto(popupUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes("Sign in to start saving memories"),
        { timeout: 15_000 },
      )
      .catch(() => {});
    const popupPath = path.join(artifactDir, "extension_popup_signed_out.png");
    await page.screenshot({ path: popupPath });
    const bodyText = await page.evaluate(() => document.body.innerText);
    const live = await probeLivePages(browser);

    const result = {
      ok: true,
      reason: "loaded",
      extensionId,
      popupPath,
      targets,
    };
    await persistLoadResult(result, {
      popupUrl,
      bodyPreview: bodyText.slice(0, 500),
      signedOut: /Sign in to start saving memories/.test(bodyText),
      live,
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result = { ok: false, reason: message };
    await persistLoadResult(result);
    return result;
  } finally {
    await browser?.close().catch(() => {});
  }
}

const result = await loadUnpacked();
console.log("[vmem e2e]", result.ok, result.reason);

await test("e2e harness records whether unpacked MV3 load succeeded", () => {
  assert.equal(typeof result.ok, "boolean");
  assert.ok(result.reason.length > 0, "load attempt always records a reason");
});

await test("e2e unpacked load path is the WXT chrome-mv3 dist folder", () => {
  assert.ok(distDir.endsWith(`${path.sep}dist${path.sep}chrome-mv3`));
  assert.equal(
    path.basename(path.resolve(distDir, "..", "..")),
    "chrome-extension",
  );
});

await test("README tells developers to load dist/chrome-mv3 unpacked", async () => {
  const readme = await readFile(
    path.join(repoRoot, "apps/chrome-extension/README.md"),
    "utf8",
  );
  assert.match(readme, /dist\/chrome-mv3/);
  assert.match(readme, /Load unpacked/);
});
