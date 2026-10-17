import { isBlocked, redactSecrets, type ActiveWindow } from "./blocklist";
import type { Settings } from "./settings-schema";

const CLIPBOARD_MAX_CHARS = 200;

/**
 * Shared gate for optional captures. Unknown active window means deny:
 * without the window we cannot apply the blocklist.
 */
function captureAllowed(
  enabled: boolean,
  settings: Settings,
  active: ActiveWindow | null,
): boolean {
  if (!enabled || settings.paused || active === null) return false;
  return !isBlocked(active, settings.blocklist);
}

export function allowClipboard(
  settings: Settings,
  active: ActiveWindow | null,
): boolean {
  return captureAllowed(settings.clipboardEnabled, settings, active);
}

export function allowScreenshot(
  settings: Settings,
  active: ActiveWindow | null,
): boolean {
  return captureAllowed(settings.screenshotsEnabled, settings, active);
}

/** Sanitised, truncated clipboard text, or null when nothing is worth keeping. */
export function clipboardSnippet(text: string): string | null {
  const cleaned = redactSecrets(text.slice(0, CLIPBOARD_MAX_CHARS * 2));
  if (cleaned.length === 0) return null;
  return cleaned.length > CLIPBOARD_MAX_CHARS
    ? `${cleaned.slice(0, CLIPBOARD_MAX_CHARS - 3)}...`
    : cleaned;
}
