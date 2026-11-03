// Sign-in settings that main, preload and the settings window share. No Electron imports.

/** The Project V production instance, as in the web app and the extension. */
export const FALLBACK_PUBLISHABLE_KEY = "pk_live_Y2xlcmsucHJvamVjdHYudWsk";

/**
 * The key to use. `VITE_CLERK_PUBLISHABLE_KEY` at build time overrides the fallback. Vite reads it for the settings
 * window, and scripts/build.mjs puts the same value into main, so both always use the same instance.
 */
export function publishableKey(override: string | undefined): string {
  return override || FALLBACK_PUBLISHABLE_KEY;
}

// The settings window loads from vmem://renderer/, so sign-in sees one stable origin (see renderer-protocol.ts).
export const RENDERER_SCHEME = "vmem";
export const RENDERER_HOST = "renderer";
export const RENDERER_URL = `${RENDERER_SCHEME}://${RENDERER_HOST}/`;

/** True for any page on vmem://renderer/. */
export function isRendererUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === `${RENDERER_SCHEME}:` && parsed.host === RENDERER_HOST
    );
  } catch {
    return false;
  }
}

/** A publishable key is `pk_(live|test)_` + base64("<frontend API host>$"). */
export function frontendApiHost(key: string): string {
  const encoded = key.split("_")[2] ?? "";
  return atob(encoded).replace(/\$$/, "");
}

/** The `iss` claim of a session token from this instance. */
export function sessionIssuer(key: string): string {
  return `https://${frontendApiHost(key)}`;
}
