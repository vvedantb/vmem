import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// GitHub packs @vv/shell with files: ["dist"], and dist is not committed.
// Fetch the public source, copy it into the installed package, then compile.
const here = dirname(fileURLToPath(import.meta.url));
const dest = [
  join(process.cwd(), "node_modules/@vv/shell"),
  join(here, "../node_modules/@vv/shell"),
  join(here, "../../../node_modules/@vv/shell"),
].find((dir) => existsSync(join(dir, "package.json")));

if (!dest) {
  console.error("@vv/shell is not installed");
  process.exit(1);
}

if (existsSync(join(dest, "dist/index.js"))) {
  process.exit(0);
}

const cache = join(here, "../../../node_modules/.cache/vv-ui");
if (!existsSync(join(cache, "packages/shell/src/index.ts"))) {
  rmSync(cache, { recursive: true, force: true });
  mkdirSync(dirname(cache), { recursive: true });
  const clone = spawnSync(
    "git",
    ["clone", "--depth", "1", "https://github.com/vvedantb/vv-ui.git", cache],
    { stdio: "inherit" },
  );
  if (clone.status !== 0) {
    process.exit(clone.status ?? 1);
  }
}

const srcPkg = join(cache, "packages/shell");
cpSync(join(srcPkg, "src"), join(dest, "src"), { recursive: true });
cpSync(join(srcPkg, "tsconfig.json"), join(dest, "tsconfig.json"));

const tsc = [
  join(process.cwd(), "node_modules/.bin/tsc"),
  join(here, "../node_modules/.bin/tsc"),
  join(here, "../../../node_modules/.bin/tsc"),
].find((file) => existsSync(file));

if (!tsc) {
  console.error("workspace tsc not found");
  process.exit(1);
}

const result = spawnSync(tsc, ["-p", "tsconfig.json"], {
  cwd: dest,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
