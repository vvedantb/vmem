import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import transformImports from "@rolldown/plugin-transform-imports";
import tanstackRouter from "@tanstack/router-plugin/vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** Cosmos imports default from gl-bench; Vite prefers `browser` (UMD min) which has no ESM default. */
const glBenchEsm = path.join(
  path.dirname(require.resolve("gl-bench/package.json")),
  "dist/gl-bench.module.js",
);

/**
 * The tabler barrel re-exports 6095 icons and rolldown resolves every one of
 * them before it can tree-shake. Rewrite each named import to the icon module
 * itself so the barrel is never loaded.
 *
 * The plugin's own transform filter is `/\.[jt]sx?$/`, which misses the virtual
 * modules TanStack Router's code-splitter emits (`route.tsx?tsr-split=...`) —
 * i.e. the route files that import the most icons. Widen it to allow a query.
 */
function tablerBarrelBypass() {
  const plugin = transformImports({
    "@tabler/icons-react": {
      transform: "@tabler/icons-react/dist/esm/icons/{{member}}.mjs",
    },
  });
  const { transform } = plugin;
  if (
    transform &&
    typeof transform === "object" &&
    transform.filter &&
    !Array.isArray(transform.filter)
  ) {
    transform.filter.id = /\.[jt]sx?(\?|$)/;
  }
  return plugin;
}

export default defineConfig(({ command }) => ({
  plugins: [
    tablerBarrelBypass(),
    tanstackRouter({
      routesDirectory: "./src/routes",
      routeFileIgnorePattern:
        "([sS]earchParams\\.ts|_components|_utils\\.ts|Client\\.tsx|Panel\\.tsx)",
      autoCodeSplitting: true,
    }),
    react(),
    // React Compiler runs on builds only. Measured over apps/web/src it costs
    // ~24s of Babel CPU (~31ms median per file) and accounts for ~90% of the
    // Babel pass. Vite does not cache source transforms to disk, so in dev every
    // restart re-pays it on every module a page pulls. Set REACT_COMPILER=1 to
    // force it on in dev when reproducing a bug only seen in compiled output.
    (command === "build" || process.env.REACT_COMPILER === "1") &&
      babel({
        presets: [reactCompilerPreset()],
      }),
    process.env.ANALYZE === "true" &&
      visualizer({
        filename: "stats.html",
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  server: {
    host: "0.0.0.0",
    cors: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "gl-bench": glBenchEsm,
    },
    // Packages using React Context MUST be deduplicated to prevent "Context not found" errors
    // When pnpm installs multiple copies (different peer deps), each has its own context instance
    // This forces all imports to resolve to the same instance at bundle time
    dedupe: [
      "react",
      "react-dom",
      "convex",
      "convex-helpers",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@clerk/clerk-react",
    ],
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // Core vendor chunks
            {
              name: "vendor-radix",
              test: /node_modules[\\/]@radix-ui/,
              priority: 15,
            },
            {
              name: "vendor-convex",
              test: /node_modules[\\/](convex|convex-helpers)/,
              priority: 15,
            },
            {
              name: "vendor-clerk",
              test: /node_modules[\\/]@clerk/,
              priority: 15,
            },
            {
              name: "vendor-motion",
              test: /node_modules[\\/](motion|framer-motion)/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
}));
