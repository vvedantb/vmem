import type { KnipConfig } from "knip";

/**
 * Dead-code/dependency gate for CI.
 *
 * Every issue type except `catalog` is an error and clean repo-wide.
 * `nsExports` / `nsTypes` are opt-in issue types in knip — `include` turns
 * them on; setting their `rules` entry alone would be a no-op.
 *
 * `catalog` stays off because syncpack (not knip) owns dependency-version
 * catalog membership.
 */
const config: KnipConfig = {
  include: ["nsExports", "nsTypes"],
  rules: {
    exports: "error",
    types: "error",
    nsExports: "error",
    nsTypes: "error",
    enumMembers: "error",
    catalog: "off",
    duplicates: "error",
    dependencies: "error",
    unlisted: "error",
    binaries: "error",
    unresolved: "error",
  },
  workspaces: {
    ".": {
      entry: [
        "oxlint-plugin-vmem/index.mjs",
        "e2e/playwright.config.ts!",
        "e2e/auth.setup.ts!",
        "e2e/fixtures.ts!",
        "e2e/specs/**/*.ts!",
        "e2e/helpers/**/*.ts!",
      ],
      project: ["oxlint-plugin-vmem/**/*.mjs", "e2e/**/*.ts"],
    },
    "apps/web": {
      entry: [
        "src/main.tsx!",
        "src/routes/**/*.tsx!",
        "vite.config.ts!",
        "scripts/generate-og-image.mjs!",
      ],
      project: ["src/**/*.{ts,tsx}", "scripts/generate-og-image.mjs"],
    },
    "apps/chrome-extension": {
      entry: [
        "src/entrypoints/**/*.{ts,tsx,html}!",
        "wxt.config.ts!",
        "tests/**/*.{mts,ts,mjs}!",
      ],
      project: [
        "src/**/*.{ts,tsx}",
        "wxt.config.ts",
        "tests/**/*.{mts,ts,mjs}",
      ],
      vite: false,
      // tailwindcss / tailwindcss-animate: used by globals.css `@import`/`@plugin`;
      // invisible to knip because vite is off for this workspace.
      ignoreDependencies: ["tailwindcss", "tailwindcss-animate"],
    },
    "packages/backend": {
      entry: [
        "convex/**/*.ts!",
        "engine/**/*.ts!",
        "tests/**/*.ts!",
        "index.ts!",
        // Build tooling invoked via `deploy` -> `build:mcp-graph-ui`; pulls in esbuild.
        "scripts/**/*.mjs!",
        // labelled Convex retrieval ablation; invoked via `eval:bench`.
        "eval/**/*.ts!",
        // esbuild entry for `build:mcp-graph-ui`. Nothing imports it, so it has
        // to be an entry, not just a project file — otherwise knip cannot see
        // its @cosmos.gl/graph import and reports that dep as unused.
        "mcp-ui/**/*.ts!",
      ],
      project: [
        "convex/**/*.ts",
        "engine/**/*.ts",
        "eval/**/*.ts",
        "tests/**/*.ts",
        "scripts/**/*.mjs",
        "mcp-ui/**/*.ts",
      ],
      ignore: ["convex/_generated/**"],
    },
    "packages/shared": {
      entry: ["src/index.ts!"],
      project: ["src/**/*.ts"],
    },
    "packages/sdk": {
      entry: ["src/index.ts!"],
      project: ["src/**/*.ts"],
    },
    "packages/ui": {
      entry: ["src/index.ts!", "src/utils/cn.ts!"],
      project: ["src/**/*.{ts,tsx}"],
    },
  },
  ignore: ["internal/**"],
  // lint-staged: used by .husky/pre-commit (`npx lint-staged`), which knip
  // does not trace
  ignoreDependencies: [
    "oxlint-tsgolint",
    "baseline-browser-mapping",
    "lint-staged",
  ],
  ignoreBinaries: ["convex"],
};

export default config;
