import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = import.meta.dirname;

// Builds the settings window into dist/renderer. Main serves it as
// vmem://renderer/ (src/renderer-protocol.ts). `base: "./"` keeps asset URLs
// relative to that page.
export default defineConfig({
  root: resolve(root, "renderer"),
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(root, "dist/renderer"),
    emptyOutDir: true,
    target: "chrome130",
    modulePreload: false,
  },
});
