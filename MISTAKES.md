# MISTAKES.md

Append-only. One short bullet per mistake agents or humans should not repeat.

- Enabling oxlint `categories.correctness` / `suspicious` globally floods Convex
  with `no-underscore-dangle` on `_id` / `_creationTime`. Prefer explicit rules
  over broad categories until those are allowlisted.
- Measured ~675 errors with `suspicious` + `correctness` both at error (455 from
  `no-underscore-dangle` alone). Safe `categories.suspicious: error` allowlist
  (all `"off"`): `no-underscore-dangle` (Convex `_id` / `_creationTime`),
  `unicorn/no-array-sort`, `typescript/consistent-return`,
  `unicorn/prefer-add-event-listener`, `unicorn/consistent-function-scoping`,
  `no-shadow`, `unicorn/require-post-message-target-origin`,
  `import/no-unassigned-import` (CSS side-effect imports), `unicorn/no-array-reverse`,
  `import/no-named-as-default`, `import/no-named-as-default-member`. Also off:
  `react/react-in-jsx-scope` — tsconfigs use `jsx: react-jsx` (React import not
  required; oxlint does not auto-detect). `correctness` stays at default warn.
