import { createRequire } from "node:module";
import { join } from "node:path";
import { nativeDir } from "./dir";

/**
 * Replaces `get-windows/lib/windows.js` in the bundle (see scripts/build.mjs).
 * Upstream finds the addon through `@mapbox/node-pre-gyp`, which does not
 * survive bundling. This loads the copied addon from a fixed path instead.
 */
interface Addon {
  getActiveWindow: () => unknown;
  getOpenWindows: () => unknown;
}

let addon: Addon | null = null;

function load(): Addon {
  if (addon !== null) return addon;
  const file = join(
    nativeDir,
    `win32-${process.arch}`,
    "node-get-windows.node",
  );
  // A missing addon must throw: the tracker logs it instead of seeing no windows.
  const loaded: Addon = createRequire(import.meta.url)(file);
  addon = loaded;
  return loaded;
}

export async function activeWindow(): Promise<unknown> {
  return load().getActiveWindow();
}

export function activeWindowSync(): unknown {
  return load().getActiveWindow();
}

export async function openWindows(): Promise<unknown> {
  return load().getOpenWindows();
}

export function openWindowsSync(): unknown {
  return load().getOpenWindows();
}
