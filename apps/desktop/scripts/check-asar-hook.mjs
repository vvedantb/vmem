/**
 * The app's own checks for `pnpm check:asar` (vvedantb-check-asar resolve).
 * It runs inside the packaged binary with ELECTRON_RUN_AS_NODE=1, after every
 * unbundled import in dist was resolved from inside the asar.
 *
 * Problems:
 * - the native files for this platform are missing from app.asar.unpacked, or
 * - the bundled tracker path (dist/active-window.js, the code that main.js
 *   runs) cannot be imported and called.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** @type {import("@vvedantb/config").AsarCheckHook} */
export default async function ({ asar }) {
  const problems = [];

  // Native files must be unpacked next to the bundle.
  const unpacked = join(`${asar}.unpacked`, "dist", "native");
  const needed =
    process.platform === "win32"
      ? [join(unpacked, `win32-${process.arch}`, "node-get-windows.node")]
      : process.platform === "darwin"
        ? [join(unpacked, "main")]
        : [];
  for (const file of needed) {
    if (!existsSync(file)) problems.push(`missing native file: ${file}`);
  }

  // Boot the bundled tracker path: import get-windows and call it.
  try {
    const { getActiveWindow } = await import(
      pathToFileURL(join(asar, "dist", "active-window.js")).href
    );
    const window = await getActiveWindow();
    console.info(`getActiveWindow ok: ${window === null ? "null" : "window"}`);
  } catch (error) {
    problems.push(`bundled tracker path failed: ${error.stack ?? error}`);
  }

  return problems;
}
