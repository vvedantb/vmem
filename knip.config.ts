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
      entry: ["oxlint-plugin-vmem/index.mjs"],
      project: ["oxlint-plugin-vmem/**/*.mjs"],
    },
    "apps/web": {
      entry: ["src/main.tsx!", "src/routes/**/*.tsx!", "vite.config.ts!"],
      project: ["src/**/*.{ts,tsx}"],
    },
    "apps/chrome-extension": {
      entry: ["src/entrypoints/**/*.{ts,tsx,html}!", "wxt.config.ts!"],
      project: ["src/**/*.{ts,tsx}", "wxt.config.ts"],
      vite: false,
      // tailwindcss / tailwindcss-animate: used by globals.css `@import`/`@plugin`;
      // invisible to knip because vite is off for this workspace.
      ignoreDependencies: ["tailwindcss", "tailwindcss-animate"],
    },
    "packages/backend": {
      entry: [
        "convex/**/*.ts!",
        "engine/**/*.ts!",
        "neo4j-cli/**/*.ts!",
        "tests/**/*.ts!",
        "index.ts!",
        // Build tooling invoked via `deploy` -> `build:mcp-graph-ui`; pulls in esbuild.
        "scripts/**/*.mjs!",
      ],
      project: [
        "convex/**/*.ts",
        "engine/**/*.ts",
        "neo4j-cli/**/*.ts",
        "tests/**/*.ts",
        "scripts/**/*.mjs",
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
  ignoreDependencies: ["oxlint-tsgolint", "baseline-browser-mapping"],
  ignoreBinaries: ["convex"],
};

export default config;
