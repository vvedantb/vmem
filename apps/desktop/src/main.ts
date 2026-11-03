import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClerkBridge } from "@clerk/electron";
import { storage } from "@clerk/electron/storage";
import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  protocol,
  shell,
  Tray,
} from "electron";
import { getActiveWindow } from "./active-window";
import { SessionAuth } from "./auth";
import { BatchStore, flushBatch } from "./batch";
import { recordingSettings } from "./can-record";
import {
  isRendererUrl,
  publishableKey,
  RENDERER_HOST,
  RENDERER_SCHEME,
  RENDERER_URL,
  sessionIssuer,
} from "./clerk";
import { fromRenderer, registerClerkOAuthIpc } from "./clerk-oauth-ipc";
import type { ActivityEvent } from "./events";
import { IPC } from "./ipc";
import { allowClipboard, allowScreenshot, clipboardSnippet } from "./privacy";
import { createRendererHandler } from "./renderer-protocol";
import { SettingsStore } from "./settings";
import { formSettingsPatchSchema } from "./settings-schema";
import { runPackagedTest, runSmoke } from "./self-test";
import { Tracker } from "./tracker";
import type { ViewState } from "./view-state";
import {
  createPoster,
  hasCredentials,
  resolveBaseUrl,
  resolveBearer,
  staticApiKey,
} from "./vmem-client";

const SMOKE = process.env["VMEM_DESKTOP_SMOKE"] === "1";
const PACKAGED_TEST = process.env["VMEM_DESKTOP_PACKAGED_TEST"] === "1";
const SELF_TEST = SMOKE || PACKAGED_TEST;
const POLL_MS = 2_000;
const SCREENSHOT_INTERVAL_MS = 10 * 60_000;
const QUIT_FLUSH_TIMEOUT_MS = 10_000;
// scripts/build.mjs replaces this with the build-time value, the same one Vite gives the settings window.
const PUBLISHABLE_KEY = publishableKey(
  process.env["VITE_CLERK_PUBLISHABLE_KEY"],
);

const here = import.meta.dirname;
const assets = join(here, "..", "assets");
const iconPath = join(assets, "icon.png");

// The name shown to users (About, menus) is vmem. Earlier builds used
// "vmem Desktop" as the name, so their settings, events and sign-in live in
// that userData folder. Keep it, or existing installs would start empty.
// `--user-data-dir` (packaged test) still wins.
app.setName("vmem");
if (!app.commandLine.hasSwitch("user-data-dir")) {
  app.setPath("userData", join(app.getPath("appData"), "vmem Desktop"));
}
app.setAboutPanelOptions({ applicationName: "vmem" });

// Self tests may run beside a real copy, so only the app itself takes the
// single-instance lock (a second request would open the real copy's window).
// Without the lock the bridge warns that deep links cannot arrive; self tests
// need none. The bridge must exist before whenReady: it registers the vmem://
// scheme, the token cache (clerk-tokens.json in userData, encrypted with
// safeStorage) and the OAuth IPC that registerClerkOAuthIpc then replaces.
const primary = SELF_TEST || app.requestSingleInstanceLock();
if (primary) {
  createClerkBridge({
    storage: storage(),
    renderer: { scheme: RENDERER_SCHEME, host: RENDERER_HOST },
    manageSingleInstanceLock: false,
    userAgent: `vmem/${app.getVersion()}`,
  });
}

/** The tray icon: a template image on macOS (the menu bar recolours it), a colour tile elsewhere. */
function trayImage(): Electron.NativeImage {
  const mac = process.platform === "darwin";
  const image = nativeImage.createFromPath(
    join(assets, mac ? "trayTemplate.png" : "tray.png"),
  );
  if (mac) image.setTemplateImage(true);
  return image;
}

/** The app icon as a data: URL for the sign-in page in the browser. Undefined if it cannot be read. */
function iconDataUrl(): string | undefined {
  try {
    return `data:image/png;base64,${readFileSync(iconPath).toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Opens https links (help, terms) in the system browser. Everything else is dropped. */
function openHttpsExternally(url: string): void {
  try {
    if (new URL(url).protocol === "https:") void shell.openExternal(url);
  } catch {
    // Not a URL.
  }
}

function log(message: string): void {
  process.stderr.write(`[vmem-desktop] ${message}\n`);
}

async function start(): Promise<void> {
  await app.whenReady();
  protocol.handle(
    RENDERER_SCHEME,
    createRendererHandler({
      rendererDir: join(here, "renderer"),
      publishableKey: PUBLISHABLE_KEY,
      fetchFile: (url) => net.fetch(url),
    }),
  );

  const userData = app.getPath("userData");
  const settings = new SettingsStore(userData);
  const batch = SMOKE ? null : new BatchStore(userData);

  let tray: Tray | null = null;
  let settingsWindow: BrowserWindow | null = null;
  let flushTimer: NodeJS.Timeout | null = null;
  let flushing: Promise<void> | null = null;
  let quitting = false;

  const auth = new SessionAuth({
    settings,
    issuer: sessionIssuer(PUBLISHABLE_KEY),
    askWindow: () => {
      if (settingsWindow === null || settingsWindow.isDestroyed()) {
        return false;
      }
      const contents = settingsWindow.webContents;
      // This upload fails; the next one finds the session again.
      if (contents.isCrashed()) {
        contents.reload();
        return false;
      }
      // A page that is still loading drops the message, so fail fast.
      if (contents.isLoading()) return false;
      contents.send(IPC.tokenRequest);
      return true;
    },
  });
  const credentials = (): boolean =>
    hasCredentials(settings.get(), process.env, auth.isSignedIn());
  /** Signed out counts as paused for the tracker and the capture gates. */
  const gatedSettings = () => recordingSettings(settings.get(), credentials());
  const post = createPoster(resolveBaseUrl(process.env), () =>
    resolveBearer(settings.get(), process.env, () => auth.sessionToken()),
  );

  const record = (event: ActivityEvent): void => batch?.append(event);
  const trackerFailures: string[] = [];
  const tracker = new Tracker({
    getActiveWindow,
    logError: (message) => {
      log(message);
      if (SELF_TEST) trackerFailures.push(message);
    },
    getIdleSeconds: () => powerMonitor.getSystemIdleTime(),
    getSettings: gatedSettings,
    record,
  });

  /**
   * The settings window, created hidden on first use. It also holds the sign-in session, so closing it only hides
   * it: main asks it for a session token before each upload. A crashed page is loaded again.
   */
  function ensureWindow(): BrowserWindow {
    if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
      if (settingsWindow.webContents.isCrashed()) {
        settingsWindow.webContents.reload();
      }
      return settingsWindow;
    }
    const win = new BrowserWindow({
      show: false,
      width: 480,
      height: 880,
      title: "vmem",
      icon: iconPath,
      webPreferences: {
        preload: join(here, "preload.cjs"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    win.removeMenu();
    win.on("close", (event) => {
      if (quitting) return;
      event.preventDefault();
      win.hide();
    });
    // Windows sends no before-quit on shutdown or log off; do not block it.
    win.on("session-end", () => {
      quitting = true;
    });
    // The window only shows vmem://renderer/. Links out go to the browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      openHttpsExternally(url);
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      if (isRendererUrl(url)) return;
      event.preventDefault();
      openHttpsExternally(url);
    });
    void win.loadURL(RENDERER_URL);
    settingsWindow = win;
    return win;
  }

  function openSettings(): void {
    const win = ensureWindow();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    // vmem has no Dock icon on macOS, so it must take focus, for example from the browser after sign-in.
    if (process.platform === "darwin") app.focus({ steal: true });
  }

  function refreshTray(): void {
    if (tray === null) return;
    const paused = settings.get().paused;
    const signedOut = !credentials();
    tray.setToolTip(
      signedOut
        ? "vmem (sign in needed)"
        : paused
          ? "vmem (paused)"
          : "vmem (recording)",
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
    if (batch === null || !credentials()) return;
    try {
      const { posted } = await flushBatch(batch, post, Date.now());
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

  function viewState(): ViewState {
    const current = settings.get();
    const {
      paused,
      idleThresholdMinutes,
      flushIntervalMinutes,
      clipboardEnabled,
      screenshotsEnabled,
      blocklist,
      launchAtLogin,
    } = current;
    return {
      settings: {
        paused,
        idleThresholdMinutes,
        flushIntervalMinutes,
        clipboardEnabled,
        screenshotsEnabled,
        blocklist,
        launchAtLogin,
      },
      auth: {
        usingSavedKey:
          !auth.isSignedIn() && staticApiKey(current, process.env) !== null,
      },
    };
  }

  function pushState(): void {
    if (settingsWindow !== null && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send(IPC.stateChanged, viewState());
    }
  }

  function applySettings(patch: object): void {
    const next = settings.update(patch);
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: next.launchAtLogin });
    }
    refreshTray();
    scheduleFlush();
    void tracker.tick();
    pushState();
  }

  auth.onChange(() => {
    refreshTray();
    void tracker.tick();
    pushState();
  });

  try {
    tray = new Tray(trayImage());
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
    if (batch === null || staticApiKey(settings.get(), process.env) === null) {
      throw new Error("Packaged test needs VMEM_API_KEY and VMEM_BASE_URL.");
    }
    await runPackagedTest(tracker, batch, post);
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
  // "Return to vmem" on the sign-in page opens vmem://renderer/: a second
  // instance on Windows and Linux, open-url on macOS.
  app.on("second-instance", openSettings);
  app.on("open-url", (event, url) => {
    if (!isRendererUrl(url)) return;
    event.preventDefault();
    openSettings();
  });

  // Social sign-in returns to a page on 127.0.0.1 (clerk-oauth-loopback.ts), not to vmem://renderer/.
  const stopClerkOAuth = registerClerkOAuthIpc({
    ipcMain,
    openExternal: (url) => shell.openExternal(url),
    bringToFront: openSettings,
    logo: iconDataUrl(),
  });
  app.on("will-quit", stopClerkOAuth);

  ipcMain.handle(IPC.getState, (event) => {
    if (!fromRenderer(event)) throw new Error("Not allowed");
    return viewState();
  });
  ipcMain.handle(IPC.saveSettings, (event, patch: unknown) => {
    if (!fromRenderer(event)) throw new Error("Not allowed");
    applySettings(formSettingsPatchSchema.parse(patch));
  });
  ipcMain.on(IPC.signedIn, (event, signedIn: unknown) => {
    if (fromRenderer(event)) auth.setSignedIn(signedIn);
  });
  ipcMain.on(IPC.tokenReply, (event, token: unknown) => {
    if (fromRenderer(event)) auth.receiveToken(token);
  });

  // A previous run may have ended mid-session: close it at its last event.
  const last = batch?.last();
  if (last?.kind === "focus") {
    record({ kind: "gap", at: last.at, reason: "shutdown" });
  }

  scheduleFlush();
  // The window loads hidden so it can answer token requests. Without
  // credentials recording stays off, so show it for sign-in.
  ensureWindow();
  if (!credentials()) openSettings();

  let busy = false;
  let lastClip: string | null = null;
  setInterval(() => {
    if (busy) return;
    busy = true;
    void tracker
      .tick()
      .then(() => {
        const current = gatedSettings();
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
    if (!allowScreenshot(gatedSettings(), tracker.activeWindow())) return;
    void captureScreenshot(userData, record);
  }, SCREENSHOT_INTERVAL_MS);

  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    event.preventDefault();
    tracker.stop();
    // The window stays open until this flush ends, so it can still answer token requests.
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
  if (!primary) {
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
