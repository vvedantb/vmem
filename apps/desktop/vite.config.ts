import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = import.meta.dirname;

// Builds the settings window into dist/renderer. `base: "./"` keeps asset URLs
// relative, because the window loads from a file: URL inside app.asar.
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
