import { join } from "node:path";
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  Tray,
} from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { getActiveWindow } from "./active-window";
import { BatchStore, flushBatch } from "./batch";
import type { ActivityEvent } from "./events";
import { allowClipboard, allowScreenshot, clipboardSnippet } from "./privacy";
import { SettingsStore } from "./settings";
import { runPackagedTest, runSmoke } from "./self-test";
import { Tracker } from "./tracker";
import { createPoster, resolveClientConfig } from "./vmem-client";

const SMOKE = process.env["VMEM_DESKTOP_SMOKE"] === "1";
const PACKAGED_TEST = process.env["VMEM_DESKTOP_PACKAGED_TEST"] === "1";
const SELF_TEST = SMOKE || PACKAGED_TEST;
const POLL_MS = 2_000;
const SCREENSHOT_INTERVAL_MS = 10 * 60_000;
const QUIT_FLUSH_TIMEOUT_MS = 10_000;

const here = import.meta.dirname;
const iconPath = join(here, "..", "assets", "icon.png");

// Fixes the userData folder name: extraMetadata.name is `vmem-desktop`.
app.setName("vmem Desktop");

function log(message: string): void {
  process.stderr.write(`[vmem-desktop] ${message}\n`);
}

async function start(): Promise<void> {
  await app.whenReady();
  const userData = app.getPath("userData");
  const settings = new SettingsStore(userData);
  const batch = SMOKE ? null : new BatchStore(userData);

  const record = (event: ActivityEvent): void => batch?.append(event);
  const trackerFailures: string[] = [];
  const tracker = new Tracker({
    getActiveWindow,
    logError: (message) => {
      log(message);
      if (SELF_TEST) trackerFailures.push(message);
    },
    getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    getSettings: () => settings.get(),
    record,
  });

  let tray: Tray | null = null;
  let settingsWindow: BrowserWindow | null = null;
  let flushTimer: NodeJS.Timeout | null = null;
  let flushing: Promise<void> | null = null;

  function openSettings(): void {
    if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      return;
    }
    const win = new BrowserWindow({
      width: 520,
      height: 780,
      title: "vmem Desktop settings",
      webPreferences: {
        preload: join(here, "preload.cjs"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    win.removeMenu();
    void win.loadFile(join(here, "renderer", "index.html"));
    settingsWindow = win;
  }

  function refreshTray(): void {
    if (tray === null) return;
    const paused = settings.get().paused;
    tray.setToolTip(
      paused ? "vmem Desktop (paused)" : "vmem Desktop (recording)",
    );
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: paused ? "Resume recording" : "Pause recording",
          click: () => applySettings({ paused: !paused }),
        },
        { label: "Open settings", click: openSettings },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
      ]),
    );
  }

  async function runFlush(): Promise<void> {
    if (batch === null) return;
    const config = resolveClientConfig(settings.get(), process.env);
    if (config === null) return;
    try {
      const { posted } = await flushBatch(
        batch,
        createPoster(config),
        Date.now(),
      );
      if (posted > 0) log(`posted ${String(posted)} memories`);
    } catch (error) {
      log(`flush failed: ${String(error)}`);
    }
  }

  /** Runs one flush at a time; callers share the in-flight run. */
  function flush(): Promise<void> {
    flushing ??= runFlush().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  function scheduleFlush(): void {
    if (flushTimer !== null) clearInterval(flushTimer);
    flushTimer = setInterval(
      () => void flush(),
      settings.get().flushIntervalMinutes * 60_000,
    );
  }

  function applySettings(patch: object): ReturnType<SettingsStore["get"]> {
    const next = settings.update(patch);
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    }
    refreshTray();
    scheduleFlush();
    void tracker.tick();
    return next;
  }

  try {
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16 }));
    refreshTray();
  } catch (error) {
    log(`tray unavailable: ${String(error)}`);
  }

  if (SMOKE) {
    // Any native failure throws to main(), which exits non-zero.
    await runSmoke(tracker, trackerFailures);
    process.stdout.write("VMEM_DESKTOP_SMOKE_OK\n");
    app.exit(0);
    return;
  }

  if (PACKAGED_TEST) {
    const config = resolveClientConfig(settings.get(), process.env);
    if (batch === null || config === null) {
      throw new Error("Packaged test needs VMEM_API_KEY and VMEM_BASE_URL.");
    }
    await runPackagedTest(tracker, batch, createPoster(config));
    process.stdout.write("VMEM_DESKTOP_PACKAGED_TEST_OK\n");
    app.exit(0);
    return;
  }

  try {
    await tracker.tick();
  } catch (error) {
    log(`tracker failed: ${String(error)}`);
  }

  app.dock?.hide();
  app.on("window-all-closed", () => {
    // Keep running in the tray.
  });
  app.on("second-instance", openSettings);

  ipcMain.handle("settings:get", () => settings.get());
  ipcMain.handle("settings:set", (_event, patch) => applySettings(patch));

  // A previous run may have ended mid-session: close it at its last event.
  const last = batch?.last();
  if (last?.kind === "focus") {
    record({ kind: "gap", at: last.at, reason: "shutdown" });
  }

  scheduleFlush();
  if (resolveClientConfig(settings.get(), process.env) === null) openSettings();

  let busy = false;
  let lastClip: string | null = null;
  setInterval(() => {
    if (busy) return;
    busy = true;
    void tracker
      .tick()
      .then(() => {
        const current = settings.get();
        if (!current.clipboardEnabled || current.paused) {
          lastClip = null;
          return;
        }
        const text = clipboard.readText();
        const seeded = lastClip !== null;
        const changed = text !== lastClip;
        lastClip = text;
        if (!seeded || !changed) return;
        const snippet = clipboardSnippet(text);
        if (
          snippet !== null &&
          allowClipboard(current, tracker.activeWindow())
        ) {
          record({ kind: "clipboard", at: Date.now(), text: snippet });
        }
      })
      .finally(() => {
        busy = false;
      });
  }, POLL_MS);

  setInterval(() => {
    if (!allowScreenshot(settings.get(), tracker.activeWindow())) return;
    void captureScreenshot(userData, record);
  }, SCREENSHOT_INTERVAL_MS);

  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    tracker.stop();
    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, QUIT_FLUSH_TIMEOUT_MS),
    );
    void Promise.race([flush(), timeout]).finally(() => app.quit());
  });
}

async function captureScreenshot(
  userData: string,
  record: (event: ActivityEvent) => void,
): Promise<void> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1280, height: 720 },
    });
    const png = sources[0]?.thumbnail.toPNG();
    if (png === undefined || png.length === 0) return;
    const dir = join(userData, "screenshots");
    mkdirSync(dir, { recursive: true });
    const at = Date.now();
    const file = join(
      dir,
      `${new Date(at).toISOString().replace(/[:.]/g, "-")}.png`,
    );
    writeFileSync(file, png);
    record({ kind: "screenshot", at, file });
  } catch (error) {
    log(`screenshot failed: ${String(error)}`);
  }
}

async function main(): Promise<void> {
  if (!SELF_TEST && !app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  try {
    await start();
  } catch (error) {
    log(`fatal: ${String(error)}`);
    app.exit(1);
  }
}

void main();
