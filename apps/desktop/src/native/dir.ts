import { join } from "node:path";

/**
 * Folder with the native files that `scripts/build.mjs` copies next to the
 * bundle. Inside a packaged app the bundle sits in `app.asar`, but native
 * files are unpacked to `app.asar.unpacked` and must load from there.
 */
export const nativeDir = join(
  import.meta.dirname.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked"),
  "native",
);
