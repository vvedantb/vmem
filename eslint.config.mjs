import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Message shown when the banned `isRecord` guard is defined or called.
 *
 * It is written to be read by a coding agent as much as by a human: the fix is
 * never to rename the helper or silence the rule, it is to remove the `unknown`
 * that made the guard look necessary in the first place.
 *
 * Type-aware rules live in Oxlint (`.oxlintrc.json` + `oxlint-tsgolint`).
 * This ESLint config stays syntax-only so the custom AST ban stays fast.
 */
const isRecordMessage =
  "`isRecord` is banned. Do not rename the helper or suppress this rule. `unknown` is fine at parse/catch boundaries — narrow immediately with zod (`schema.safeParse(...)`). Do not invent `Reflect.get` / `objectField` / fetch-instanceof ceremonies to appease lint; parse external JSON with zod when shaping data.";

const bannedIsRecord = [
  ":matches(FunctionDeclaration, TSDeclareFunction)[id.name='isRecord']",
  "VariableDeclarator[id.name='isRecord']",
  ":matches(MethodDefinition, Property, TSMethodSignature)[key.name='isRecord']",
  "CallExpression[callee.name='isRecord']",
].map((selector) => ({ selector, message: isRecordMessage }));

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/_generated/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.expo/**",
      "**/.vercel/**",
      "**/android/**",
      "**/ios/**",
      "**/routeTree.gen.ts",
      "**/*.d.ts",
      "eslint-report.json",
    ],
  },
  eslint.configs.recommended,
  // Syntax-only — type-aware linting is Oxlint + tsgolint (`pnpm lint`).
  tseslint.configs.recommended,
  {
    rules: {
      "no-restricted-syntax": ["error", ...bannedIsRecord],
      // `catch {}` to deliberately ignore a failure is a convention here.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    // TypeScript already resolves every identifier; `no-undef` only duplicates
    // that check and misreads TS-only syntax.
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: { "no-undef": "off" },
  },
  {
    // Node scripts and build config files (metro, tailwind, postcss, …).
    files: ["**/*.{js,cjs,mjs}", "**/scripts/**", "**/*.config.{ts,mts}"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Browser-driving verification scripts run code inside the page context.
    files: ["apps/chrome-extension/scripts/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // React Native resolves bundled assets through `require()` — there is no
    // import form for `<Image source={require("…png")} />`.
    files: ["apps/mobile/**"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
