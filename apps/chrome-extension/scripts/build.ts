import { build } from "vite";
import { cpSync, rmSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import {
  createPopupConfig,
  createBackgroundConfig,
  createContentScriptConfig,
  createOffscreenConfig,
} from "../vite.config.js";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const mode = process.argv.includes("--watch") ? "development" : "production";

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

cpSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
cpSync(resolve(root, "src/welcome/index.html"), resolve(dist, "welcome.html"));

const publicDir = resolve(root, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, dist, { recursive: true });
}

console.log("Building popup...");
await build(createPopupConfig(mode));

console.log("Building offscreen...");
await build(createOffscreenConfig(mode));

console.log("Building background service worker...");
await build(createBackgroundConfig(mode));

console.log("Building ChatGPT content script...");
await build(
  createContentScriptConfig(
    "content-chatgpt",
    "src/content/chatgpt/index.ts",
    mode,
  ),
);

console.log("Building Claude content script...");
await build(
  createContentScriptConfig(
    "content-claude",
    "src/content/claude/index.ts",
    mode,
  ),
);

console.log("Building selection content script...");
await build(
  createContentScriptConfig(
    "content-selection",
    "src/content/selection/index.ts",
    mode,
  ),
);

console.log("Building screenshot content script...");
await build(
  createContentScriptConfig(
    "content-screenshot",
    "src/content/screenshot/index.ts",
    mode,
  ),
);

console.log("Building YouTube content script...");
await build(
  createContentScriptConfig(
    "content-youtube",
    "src/content/youtube/index.ts",
    mode,
  ),
);

console.log("Building Readability content script...");
await build(
  createContentScriptConfig(
    "content-readability",
    "src/content/readability/index.ts",
    mode,
  ),
);

console.log("Build complete → dist/");
