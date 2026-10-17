import { settingsSchema, type Settings } from "../src/settings-schema";

declare global {
  interface Window {
    vmemDesktop?: {
      getSettings: () => Promise<unknown>;
      saveSettings: (patch: Partial<Settings>) => Promise<unknown>;
    };
  }
}

function field<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing field #${id}`);
  return element;
}

const apiKey = field("apiKey", HTMLInputElement);
const baseUrl = field("baseUrl", HTMLInputElement);
const paused = field("paused", HTMLInputElement);
const idle = field("idleThresholdMinutes", HTMLInputElement);
const flush = field("flushIntervalMinutes", HTMLInputElement);
const clipboard = field("clipboardEnabled", HTMLInputElement);
const screenshots = field("screenshotsEnabled", HTMLInputElement);
const launch = field("launchAtLogin", HTMLInputElement);
const blocklist = field("blocklist", HTMLTextAreaElement);
const form = field("form", HTMLFormElement);
const status = field("status", HTMLSpanElement);

function show(settings: Settings): void {
  apiKey.value = settings.apiKey;
  baseUrl.value = settings.baseUrl;
  paused.checked = settings.paused;
  idle.value = String(settings.idleThresholdMinutes);
  flush.value = String(settings.flushIntervalMinutes);
  clipboard.checked = settings.clipboardEnabled;
  screenshots.checked = settings.screenshotsEnabled;
  launch.checked = settings.launchAtLogin;
  blocklist.value = settings.blocklist.join("\n");
}

function bridge(): NonNullable<Window["vmemDesktop"]> {
  if (!window.vmemDesktop) throw new Error("Preload bridge missing");
  return window.vmemDesktop;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const patch = settingsSchema.partial().safeParse({
    apiKey: apiKey.value.trim(),
    baseUrl: baseUrl.value.trim(),
    paused: paused.checked,
    idleThresholdMinutes: Number(idle.value),
    flushIntervalMinutes: Number(flush.value),
    clipboardEnabled: clipboard.checked,
    screenshotsEnabled: screenshots.checked,
    launchAtLogin: launch.checked,
    blocklist: blocklist.value
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  });
  if (!patch.success) {
    status.textContent = "Check the values and try again.";
    return;
  }
  void bridge()
    .saveSettings(patch.data)
    .then((saved) => {
      show(settingsSchema.parse(saved));
      status.textContent = "Saved.";
    });
});

void bridge()
  .getSettings()
  .then((raw) => show(settingsSchema.parse(raw)));
