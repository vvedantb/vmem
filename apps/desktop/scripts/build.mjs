import { chmod, cp, mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { build } from "esbuild";
import { build as viteBuild } from "vite";

const common = { bundle: true, sourcemap: false, logLevel: "warning" };

// get-windows loads natives through __dirname and node-pre-gyp, and neither
// works from a bundle. Swap its two native loaders for typed shims that read
// from dist/native (see src/native). Linux uses xprop and needs no native file.
const getWindowsDir = dirname(
  createRequire(import.meta.url).resolve("get-windows"),
);
const shims = new Map([
  [
    join(getWindowsDir, "lib", "windows.js"),
    resolve("src/native/get-windows-windows.ts"),
  ],
  [
    join(getWindowsDir, "lib", "macos.js"),
    resolve("src/native/get-windows-macos.ts"),
  ],
]);
const getWindowsShims = {
  name: "get-windows-native-shims",
  setup(b) {
    b.onResolve({ filter: /\/lib\/(windows|macos)\.js$/ }, (args) => {
      const real = resolve(args.resolveDir, args.path);
      const shim = shims.get(real);
      return shim === undefined ? undefined : { path: shim };
    });
  },
};

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await Promise.all([
  build({
    ...common,
    // active-window is a second entry so scripts/check-asar-modules.mjs can
    // import the exact tracker path that main.js uses (Electron is not needed).
    entryPoints: ["src/main.ts", "src/active-window.ts"],
    outdir: "dist",
    splitting: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["electron"],
    plugins: [getWindowsShims],
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
  }),
  build({
    ...common,
    entryPoints: ["src/preload.ts"],
    outfile: "dist/preload.cjs",
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
  }),
  // The settings window: React, Tailwind and @vvedantb/ui (see vite.config.ts).
  viteBuild({ logLevel: "warn" }),
]);

await copyNatives();

/**
 * Copies the native files that the shims load into dist/native. The host
 * platform decides what is required: Windows needs the addon for the build
 * arch, macOS needs the Swift binary. CI must build or fetch them first.
 */
async function copyNatives() {
  const out = join("dist", "native");
  await mkdir(out, { recursive: true });

  if (process.platform === "darwin") {
    const main = join(getWindowsDir, "main");
    if (!existsSync(main)) throw new Error(`Missing macOS binary: ${main}`);
    await cp(main, join(out, "main"));
    await chmod(join(out, "main"), 0o755);
  }

  if (process.platform === "win32") {
    const found = await findWindowsAddons();
    if (found.size === 0) {
      throw new Error(
        "No node-get-windows.node found. Run `node-pre-gyp install --fallback-to-build` in get-windows first.",
      );
    }
    for (const [arch, file] of found) {
      await mkdir(join(out, `win32-${arch}`), { recursive: true });
      await cp(file, join(out, `win32-${arch}`, "node-get-windows.node"));
    }
  }
}

/** Maps arch to addon path. A fresh build/Release addon wins for the host arch. */
async function findWindowsAddons() {
  const found = new Map();
  const bindings = join(getWindowsDir, "lib", "binding");
  if (existsSync(bindings)) {
    for (const dir of await readdir(bindings)) {
      const match = /-win32-[^-]+-(x64|arm64|ia32)$/.exec(dir);
      const file = join(bindings, dir, "node-get-windows.node");
      if (match?.[1] !== undefined && existsSync(file))
        found.set(match[1], file);
    }
  }
  const built = join(
    getWindowsDir,
    "build",
    "Release",
    "node-get-windows.node",
  );
  if (existsSync(built)) found.set(process.arch, built);
  return found;
}
