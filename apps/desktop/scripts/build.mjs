import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const common = { bundle: true, sourcemap: false, logLevel: "warning" };

await rm("dist", { recursive: true, force: true });
await mkdir("dist/renderer", { recursive: true });

await Promise.all([
  build({
    ...common,
    entryPoints: ["src/main.ts"],
    outfile: "dist/main.js",
    platform: "node",
    format: "esm",
    target: "node22",
    // get-windows stays external: it loads native binaries at run time.
    external: ["electron", "get-windows"],
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
  build({
    ...common,
    entryPoints: ["renderer/settings.ts"],
    outfile: "dist/renderer/settings.js",
    platform: "browser",
    format: "iife",
    target: "chrome130",
  }),
]);

await cp("renderer/index.html", "dist/renderer/index.html");
