# LEARNINGS.md

Append-only. Env, tooling, and domain facts worth remembering.

- Custom oxlint rules live in `oxlint-plugin-vmem/` and are wired via
  `jsPlugins` in `.oxlintrc.json` (JS plugins are alpha; not semver-stable).
- Type-aware lint is Oxlint + `oxlint-tsgolint`; ESLint stays syntax-only for
  the `isRecord` ban.
- `pnpm --filter @vmem/backend typecheck` uses `tsgo` against generated
  `_generated/` — do not rely on `convex codegen --typecheck enable` for
  local typecheck (it skips when `tsgo` is only at the workspace root `.bin`).
- Package-boundary lint: relative cross-package imports and deep
  `@vmem/backend|shared|sdk/...` imports are errors.
- Knip is wired into CI (`pnpm knip`) with unused exports/deps off for now;
  only `unresolved` imports are errors. Promote `dependencies`/`unlisted` after
  a dedicated cleanup. Oxlint `categories.*` were not enabled — Convex `_id`
  trips `no-underscore-dangle` in bulk.
