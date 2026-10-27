import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { srcAlias } from "@vvedantb/config";
import { defineVExtensionConfig } from "@vvedantb/config/extension";

export default defineConfig({
  ...defineVExtensionConfig({
    app: "vmem",
    react: { plugin: react },
    tailwindcss,
    // skip legacy browser downleveling for clerk chunks and esbuild
    buildTarget: "chrome120",
    hosts: [
      "https://vmem.projectv.uk/*",
      "https://vmem.vedantb.com/*",
      "https://clerk.projectv.uk/*",
      "https://chat.openai.com/*",
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://www.youtube.com/*",
      "https://youtube.com/*",
      "<all_urls>",
    ],
    // staging hosts ship in development builds only
    devHosts: [
      "https://vmem-git-staging-vedantb.vercel.app/*",
      "https://allowing-coyote-80.clerk.accounts.dev/*",
    ],
    manifest: {
      description: "Memory layer for your browser",
      version: "0.2.0",
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
        "cookies",
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
    },
  }),
  srcDir: "src",
  outDir: "dist",
  publicDir: "public",
  imports: false,
  alias: srcAlias(import.meta.dirname),
});
