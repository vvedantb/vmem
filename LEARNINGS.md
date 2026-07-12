# LEARNINGS.md

Append-only. Env, tooling, and domain facts worth remembering.

- Custom oxlint rules live in `oxlint-plugin-vmem/` and are wired via
  `jsPlugins` in `.oxlintrc.json` (JS plugins are alpha; not semver-stable).
- Type-aware lint is Oxlint + `oxlint-tsgolint`; ESLint stays syntax-only for
  the `isRecord` ban. `pnpm lint` is `oxlint --type-aware --deny-warnings &&
eslint . --max-warnings 0` — the deny-warnings ratchet is intentional:
  future oxlint upgrades that introduce new default-correctness warnings fail
  on the upgrade PR instead of silently accumulating.
- `categories.suspicious: error` is on with a measured off-list (Convex
  `_id`/`_creationTime` via `no-underscore-dangle`, CSS side-effect imports,
  CJS interop, etc.) — see MISTAKES.md. `correctness` stays at oxlint's
  default warn level; deny-warnings still gates it.
- `pnpm --filter @vmem/backend typecheck` uses `tsgo` against generated
  `_generated/` — do not rely on `convex codegen --typecheck enable` for
  local typecheck (it skips when `tsgo` is only at the workspace root `.bin`).
- Package-boundary lint: relative cross-package imports and deep
  `@vmem/backend|shared|sdk/...` imports are errors.
- Knip gates all promotable issue rules as error (dependencies, unlisted,
  exports, types, nsExports, nsTypes, enumMembers, duplicates, binaries).
- `noUncheckedIndexedAccess` lives in root `tsconfig.base.json` and applies
  to every TS workspace.
- New named `useEffect` imports from `react` are banned in `apps/web` and
  `apps/chrome-extension` (`no-restricted-imports`); grandfathered files are
  listed in `.oxlintrc.json` — shrink, never grow.
