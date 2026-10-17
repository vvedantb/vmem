import type { Settings } from "./settings-schema";

/** Recording needs sign-in (or a saved key) and Pause off. */
export function canRecord(
  settings: Settings,
  hasCredentials: boolean,
): boolean {
  return hasCredentials && !settings.paused;
}

/**
 * Settings as the tracker and the capture gates see them: signed out counts
 * as paused, even when the Pause switch is off.
 */
export function recordingSettings(
  settings: Settings,
  hasCredentials: boolean,
): Settings {
  return canRecord(settings, hasCredentials)
    ? settings
    : { ...settings, paused: true };
}
