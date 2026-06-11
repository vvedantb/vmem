import { resolve } from "path";
import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const root = import.meta.dirname;

/** MV3 — no need to downlevel for legacy browsers; avoids esbuild destructuring errors on Clerk chunks. */
const extensionBuildTarget = "chrome120";

const sharedResolve = {
  alias: {
    "@": resolve(root, "src"),
  },
};

export function createPopupConfig(mode: string): UserConfig {
  return {
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    plugins: [react(), tailwindcss()],
    resolve: sharedResolve,
    root: resolve(root, "src/popup"),
    base: "./",
    build: {
      target: extensionBuildTarget,
      outDir: resolve(root, "dist/popup"),
      emptyOutDir: false,
      sourcemap: mode === "development",
      rollupOptions: {
        input: { popup: resolve(root, "src/popup/index.html") },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name].js",
          assetFileNames: "[name].[ext]",
        },
      },
    },
    publicDir: false,
  };
}

export function createBackgroundConfig(mode: string): UserConfig {
  return {
    define: {
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    resolve: sharedResolve,
    build: {
      target: extensionBuildTarget,
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: mode === "development",
      lib: {
        entry: resolve(root, "src/background/index.ts"),
        formats: ["es"],
        fileName: () => "background.js",
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
    publicDir: false,
  };
}

export function createContentScriptConfig(
  name: string,
  entry: string,
  mode: string,
): UserConfig {
  return {
    resolve: sharedResolve,
    build: {
      target: extensionBuildTarget,
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: mode === "development",
      lib: {
        entry: resolve(root, entry),
        formats: ["iife"],
        name: name.replace(/-/g, "_"),
        fileName: () => `${name}.js`,
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
    publicDir: false,
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: sharedResolve,
  build: {
    outDir: "dist",
    sourcemap: mode === "development",
  },
}));
