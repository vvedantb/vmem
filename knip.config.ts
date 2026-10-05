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
      // packageExtensions on @vvedantb/ui restore omitted npm peers; knip
      // reads those names from pnpm-workspace.yaml as unlisted deps.
      ignoreDependencies: [
        "@radix-ui/react-accordion",
        "@radix-ui/react-checkbox",
        "@radix-ui/react-collapsible",
        "@radix-ui/react-context-menu",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-hover-card",
        "@radix-ui/react-label",
        "@radix-ui/react-popover",
        "@radix-ui/react-progress",
        "@radix-ui/react-scroll-area",
        "@radix-ui/react-select",
        "@radix-ui/react-separator",
        "@radix-ui/react-slot",
        "@radix-ui/react-switch",
        "@radix-ui/react-tabs",
        "@radix-ui/react-tooltip",
        "@radix-ui/react-use-controllable-state",
        "@radix-ui/react-visually-hidden",
        "@streamdown/cjk",
        "@streamdown/code",
        "@streamdown/math",
        "@streamdown/mermaid",
        "@tabler/icons-react",
        "@vvedantb/tokens",
        "ai",
        "class-variance-authority",
        "clsx",
        "cmdk",
        "embla-carousel-react",
        "motion",
        "nanoid",
        "radix-ui",
        "react",
        "react-dom",
        "shiki",
        "sonner",
        "streamdown",
        "tailwind-merge",
        "use-stick-to-bottom",
        "vaul",
      ],
    },
    "apps/web": {
      entry: [
        "src/main.tsx!",
        "src/routes/**/*.tsx!",
        "vite.config.ts!",
        "scripts/generate-og-image.mjs!",
      ],
      project: ["src/**/*.{ts,tsx}", "scripts/generate-og-image.mjs"],
      // tailwindcss / tailwindcss-animate / shadow-plugin: used by globals.css
      // `@import`/`@plugin`; knip does not trace stylesheet imports.
      ignoreDependencies: [
        "tailwindcss",
        "tailwindcss-animate",
        "shadow-plugin",
        "@vvedantb/tokens",
        "nanoid",
      ],
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
      // tailwindcss / tailwindcss-animate / shadow-plugin: used by globals.css
      // `@import`/`@plugin`; invisible to knip because vite is off here.
      ignoreDependencies: [
        "tailwindcss",
        "tailwindcss-animate",
        "shadow-plugin",
        "@vvedantb/tokens",
        "nanoid",
      ],
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
  },
  ignore: ["apps/docs/**", "internal/**"],
  // lint-staged: used by .husky/pre-commit (`npx lint-staged`), which knip
  // does not trace
  ignoreDependencies: [
    "oxlint-tsgolint",
    "baseline-browser-mapping",
    "lint-staged",
  ],
  ignoreBinaries: ["convex", "mint"],
};

export default config;
