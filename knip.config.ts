import type { KnipConfig } from "knip";

/**
 * Unresolved-import gate for CI.
 *
 * Unused deps/exports stay off for now (noisy across apps). Promote
 * `dependencies` / `unlisted` to error after a dedicated cleanup PR.
 */
const config: KnipConfig = {
  rules: {
    exports: "off",
    types: "off",
    nsExports: "off",
    nsTypes: "off",
    enumMembers: "off",
    catalog: "off",
    duplicates: "off",
    dependencies: "off",
    unlisted: "off",
    binaries: "off",
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
    },
    "packages/backend": {
      entry: [
        "convex/**/*.ts!",
        "engine/**/*.ts!",
        "neo4j-cli/**/*.ts!",
        "tests/**/*.ts!",
        "index.ts!",
      ],
      project: [
        "convex/**/*.ts",
        "engine/**/*.ts",
        "neo4j-cli/**/*.ts",
        "tests/**/*.ts",
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
