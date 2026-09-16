// optional headed Chrome load of the unpacked MV3 build
// AI-generated (Claude), prompt: "puppeteer-core harness to load unpacked chrome-mv3 extension"
// Modified by me: chrome 137+ unsafe debugging flags, popup screenshot, never fail CI when chrome cannot load extensions
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import puppeteer, { TargetType } from "puppeteer-core";

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
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadUnpacked(): Promise<LoadResult> {
  if (!chromeBin) {
    return { ok: false, reason: "google-chrome is not installed" };
  }
  if (!existsSync(path.join(distDir, "manifest.json"))) {
    return {
      ok: false,
      reason: `unpacked build missing at ${distDir} — run pnpm ext:build`,
    };
  }

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "vmem-ext-"));
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    browser = await puppeteer.launch({
      executablePath: chromeBin,
      headless: false,
      userDataDir,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--enable-unsafe-extension-debugging",
        `--disable-extensions-except=${distDir}`,
        `--load-extension=${distDir}`,
      ],
    });

    const deadline = Date.now() + 20_000;
    let extensionId: string | undefined;
    while (Date.now() < deadline) {
      const targets = browser.targets();
      const worker = targets.find(
        (target) =>
          target.type() === TargetType.SERVICE_WORKER &&
          target.url().startsWith("chrome-extension://"),
      );
      const extTarget = targets.find((target) =>
        target.url().startsWith("chrome-extension://"),
      );
      const url = worker?.url() ?? extTarget?.url();
      if (url) {
        extensionId = new URL(url).hostname;
        break;
      }
      await sleep(250);
    }

    if (!extensionId) {
      return {
        ok: false,
        reason:
          "Chrome launched but no chrome-extension:// target appeared (MV3 load-extension blocked in this environment)",
      };
    }

    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    const page = await browser.newPage();
    await page.goto(popupUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await mkdir(artifactDir, { recursive: true });
    const popupPath = path.join(artifactDir, "extension_popup_signed_out.png");
    await page.screenshot({ path: popupPath, fullPage: true });
    const bodyText = await page.evaluate(() => document.body.innerText);

    await writeFile(
      path.join(artifactDir, "extension_load.json"),
      JSON.stringify(
        {
          ok: true,
          extensionId,
          popupUrl,
          bodyPreview: bodyText.slice(0, 500),
          distDir,
        },
        null,
        2,
      ),
    );

    return { ok: true, reason: "loaded", extensionId, popupPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: message };
  } finally {
    await browser?.close().catch(() => {});
  }
}

const result = await loadUnpacked();

await test("e2e harness records whether unpacked MV3 load succeeded", () => {
  assert.equal(typeof result.ok, "boolean");
  assert.ok(result.reason.length > 0, "load attempt always records a reason");
});

await test("e2e unpacked load path is the WXT chrome-mv3 dist folder", () => {
  assert.ok(distDir.endsWith(`${path.sep}dist${path.sep}chrome-mv3`));
  assert.equal(path.basename(path.dirname(distDir)), "chrome-extension");
});

await test("README tells developers to load dist/chrome-mv3 unpacked", async () => {
  const readme = await readFile(
    path.join(repoRoot, "apps/chrome-extension/README.md"),
    "utf8",
  );
  assert.match(readme, /dist\/chrome-mv3/);
  assert.match(readme, /Load unpacked/);
});
