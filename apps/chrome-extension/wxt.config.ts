import { resolve } from "node:path";
import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = import.meta.dirname;

// mv3: avoid downleveling for legacy browsers (Clerk chunks + esbuild)
const extensionBuildTarget = "chrome120";

export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  publicDir: "public",
  imports: false,
  alias: {
    "@": resolve(root, "src"),
  },
  manifest: {
    name: "vmem",
    description: "Memory layer for your browser",
    version: "0.1.0",
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
    permissions: [
      "storage",
      "contextMenus",
      "activeTab",
      "bookmarks",
      "history",
      "alarms",
      "scripting",
      "identity",
      "cookies",
    ],
    host_permissions: [
      "https://vmem-git-staging-vedantb.vercel.app/*",
      "https://flexible-duckling-74.clerk.accounts.dev/*",
      "https://chat.openai.com/*",
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://www.youtube.com/*",
      "https://youtube.com/*",
      "<all_urls>",
    ],
    commands: {
      "save-page": {
        suggested_key: {
          default: "Alt+S",
          mac: "Alt+S",
        },
        description: "Save current page to vmem",
      },
      "take-screenshot": {
        suggested_key: {
          default: "Alt+Shift+S",
          mac: "Alt+Shift+S",
        },
        description: "Capture a region screenshot to vmem",
      },
    },
    action: {
      default_icon: {
        "16": "icons/icon-16.png",
        "48": "icons/icon-48.png",
        "128": "icons/icon-128.png",
      },
    },
    icons: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    web_accessible_resources: [
      {
        resources: ["icon-dark.svg", "icon-light.svg"],
        matches: ["<all_urls>"],
      },
    ],
  },
  vite: () => ({
    plugins: [react(), tailwindcss()],
    build: {
      target: extensionBuildTarget,
    },
  }),
});
