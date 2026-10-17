/**
 * Checks the packaged app.asar for missing modules. Plain Node cannot read an
 * asar, so this script runs itself inside the packaged binary with
 * ELECTRON_RUN_AS_NODE=1, where Electron's asar support is active.
 *
 * Usage: node scripts/check-asar-modules.mjs [binary] [app.asar]
 * Defaults to the Linux dir package in release/linux-unpacked.
 *
 * The check fails if:
 * - a bare import in the packaged bundle (not electron, not a Node built-in)
 *   cannot be resolved from inside the asar, or
 * - the bundled tracker path (dist/active-window.js, the code that main.js
 *   runs) cannot be imported and called, or
 * - the native files for this platform are missing from app.asar.unpacked.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHILD = "VMEM_CHECK_ASAR_CHILD";
const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function bareSpecifiers(source) {
  const found = new Set();
  for (const match of source.matchAll(IMPORT_SPECIFIER)) {
    const spec = match[1];
    if (spec.startsWith(".") || spec.startsWith("/")) continue;
    if (spec.startsWith("node:") || spec === "electron") continue;
    if (builtinModules.includes(spec.split("/")[0])) continue;
    found.add(spec);
  }
  return found;
}

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(path);
    return /\.(c|m)?js$/.test(entry.name) ? [path] : [];
  });
}

async function child(asar) {
  const problems = [];
  const dist = join(asar, "dist");
  const requireFromAsar = createRequire(join(asar, "package.json"));

  // 1. Every unbundled JS import must resolve from inside the asar.
  const specs = new Set();
  const files = jsFiles(dist);
  for (const file of files) {
    for (const spec of bareSpecifiers(readFileSync(file, "utf8"))) {
      specs.add(spec);
    }
  }
  for (const spec of specs) {
    try {
      requireFromAsar.resolve(spec);
    } catch (error) {
      problems.push(`unresolved import "${spec}": ${error.message}`);
    }
  }
  console.info(
    `checked ${files.length} JS files, ${specs.size} unbundled imports`,
  );

  // 2. Native files must be unpacked next to the bundle.
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

  // 3. Boot the bundled tracker path: import get-windows and call it.
  try {
    const { getActiveWindow } = await import(
      pathToFileURL(join(dist, "active-window.js")).href
    );
    const window = await getActiveWindow();
    console.info(`getActiveWindow ok: ${window === null ? "null" : "window"}`);
  } catch (error) {
    problems.push(`bundled tracker path failed: ${error.stack ?? error}`);
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    process.exit(1);
  }
  console.info("CHECK_ASAR_OK");
}

if (process.env[CHILD] === "1") {
  await child(process.argv[2]);
} else {
  const binary = resolve(
    process.argv[2] ??
      resolve(import.meta.dirname, "../release/linux-unpacked/vmem-desktop"),
  );
  const asar = resolve(
    process.argv[3] ?? join(dirname(binary), "resources", "app.asar"),
  );
  if (!existsSync(asar)) {
    console.error(`No asar at ${asar}. Package the app first.`);
    process.exit(1);
  }
  const result = spawnSync(binary, [new URL(import.meta.url).pathname, asar], {
    stdio: "inherit",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", [CHILD]: "1" },
  });
  process.exit(result.status ?? 1);
}
