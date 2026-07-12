import type { KnipConfig } from "knip";

/**
 * Dead-code/dependency gate for CI.
 *
 * `nsExports` / `nsTypes` / `enumMembers` / `duplicates` / `binaries` /
 * `unresolved` are errors and clean repo-wide. `nsExports` / `nsTypes` are
 * opt-in issue types in knip — `include` turns them on; setting their
 * `rules` entry alone would be a no-op.
 *
 * `dependencies` / `unlisted` / `exports` / `types` stay off: real findings
 * remain (unused deps, an unlisted `vite/client`, dead exports) that can't
 * be closed by config alone without deleting code — see DESIRES.md.
 * `catalog` stays off because syncpack (not knip) owns dependency-version
 * catalog membership.
 */
const config: KnipConfig = {
  include: ["nsExports", "nsTypes"],
  rules: {
    exports: "off",
    types: "off",
    nsExports: "error",
    nsTypes: "error",
    enumMembers: "error",
    catalog: "off",
    duplicates: "error",
    dependencies: "off",
    unlisted: "off",
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
    "apps/mobile": {
      entry: ["app/**/*.{ts,tsx}!", "src/**/*.{ts,tsx}!", "app.config.ts!"],
      project: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
      ignoreFiles: ["metro.config.js", "babel.config.js"],
      ignoreUnresolved: ["babel-preset-expo"],
      // NativeWind metro config expects a root tailwind.config knip can't resolve.
      expo: false,
      metro: false,
    },
    "apps/chrome-extension": {
      entry: ["src/**/*.{ts,tsx}!"],
      project: ["src/**/*.{ts,tsx}"],
      vite: false,
      // tailwindcss / tailwindcss-animate: used by globals.css `@import`/`@plugin`;
      // invisible to knip because vite is off and build scripts are untracked (afe1d9b9).
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
  ignore: ["apps/docs/**", "internal/**"],
  ignoreFiles: ["apps/mobile/metro.config.js", "apps/mobile/babel.config.js"],
  ignoreDependencies: ["oxlint-tsgolint", "baseline-browser-mapping"],
  ignoreBinaries: ["convex", "mint"],
};

export default config;
