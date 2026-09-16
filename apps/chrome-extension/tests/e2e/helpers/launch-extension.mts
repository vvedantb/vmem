// shared headed Chrome launch for unpacked dist/chrome-mv3
// AI-generated (Claude), prompt: "puppeteer helper to load unpacked vmem MV3 extension"
// Modified by me: pipe + enableExtensions, artifact dir, service-worker wait
import { mkdir, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer, { TargetType, type Browser } from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
export const extensionRoot = path.resolve(here, "../../..");
export const distDir = path.join(extensionRoot, "dist/chrome-mv3");
export const chromeBin =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"].find((bin) =>
    existsSync(bin),
  );

export const artifactDir =
  process.env.VMEM_EXT_ARTIFACT_DIR ??
  (existsSync("/opt/cursor/artifacts")
    ? "/opt/cursor/artifacts"
    : path.join(extensionRoot, "tests/e2e/artifacts"));

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureArtifactDir(): Promise<string> {
  await mkdir(artifactDir, { recursive: true });
  return artifactDir;
}

export async function launchUnpackedExtension(): Promise<{
  browser: Browser;
  extensionId: string;
}> {
  if (!chromeBin) {
    throw new Error("google-chrome is not installed");
  }
  if (!existsSync(path.join(distDir, "manifest.json"))) {
    throw new Error(
      `unpacked build missing at ${distDir} — run pnpm ext:build`,
    );
  }

  const userDataDir = await mkdtemp(path.join(os.tmpdir(), "vmem-ext-"));
  const browser = await puppeteer.launch({
    executablePath: chromeBin,
    headless: false,
    userDataDir,
    pipe: true,
    enableExtensions: [distDir],
    protocolTimeout: 120_000,
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--enable-unsafe-extension-debugging",
    ],
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const worker = browser.targets().find((target) => {
      return (
        target.type() === TargetType.SERVICE_WORKER &&
        target.url().startsWith("chrome-extension://")
      );
    });
    const url = worker?.url();
    if (url) {
      return { browser, extensionId: new URL(url).hostname };
    }
    await sleep(250);
  }

  await browser.close().catch(() => {});
  throw new Error("no chrome-extension:// service worker appeared");
}
