# AGENTS.md

Shared contracts for humans and coding agents working in this repo.
Project-specific Convex/UI rules also live in `CLAUDE.md` when present locally —
follow both. When they conflict, prefer the stricter type-safety rule.

## Think before coding

- State assumptions and tradeoffs before changing architecture.
- Prefer the simplest solution another engineer can maintain.
- If requirements are ambiguous, ask before implementing.

## Surgical changes

- Only touch what the task requires.
- Mention unrelated dead code or drive-by fixes; do not delete or "clean up"
  outside the request unless asked.
- Do not expand scope into refactors adjacent to the change.

## Done = verified

Do not claim done until the narrowest useful gate for the change has passed:

| Change type                        | Minimum verification                                               |
| ---------------------------------- | ------------------------------------------------------------------ |
| Lint / oxlint plugin / CLAUDE-only | `pnpm lint` + `pnpm test:oxlint-plugin`                            |
| Type / API surface                 | above + scoped `pnpm typecheck` / package typecheck                |
| Runtime behaviour                  | above + scoped `pnpm test`                                         |
| Dead exports / deps                | `pnpm knip`                                                        |
| Merge-ready / ship                 | `pnpm check` (lint + typecheck + knip + plugin tests + unit tests) |

Evidence over assertions: paste the command output or link the failing/passing
check. "Should work" is not done.

## Package roles

| Package                 | Role                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`              | Product SPA (Vite + TanStack Router). Imports `@vmem/backend`, `@vmem/shared`, `@vmem/ui` only at public exports.                                           |
| `apps/mobile`           | Expo app. Same public-package import rules.                                                                                                                 |
| `apps/chrome-extension` | Extension UI + background.                                                                                                                                  |
| `apps/docs`             | Mintlify docs site.                                                                                                                                         |
| `packages/backend`      | Convex functions (`convex/`), Node engine (`engine/`), MCP, neo4j-cli, tests. Public export is `@vmem/backend` (`api`, `Doc`, `Id`) only — no deep imports. |
| `packages/shared`       | Cross-app constants + client-safe helpers.                                                                                                                  |
| `packages/sdk`          | Published JS SDK for the HTTP memory API.                                                                                                                   |
| `packages/ui`           | Shared UI primitives. Root + `@vmem/ui/cn` subpath are OK.                                                                                                  |
| `oxlint-plugin-vmem`    | Custom oxlint rules for vmem conventions.                                                                                                                   |

### Boundaries (enforced by lint)

- No relative imports that cross a workspace package (`vmem/no-cross-package-relative-imports`).
- No deep imports into `@vmem/backend`, `@vmem/shared`, or `@vmem/sdk` (`vmem/no-deep-package-imports`).
- `engine/` must not import `convex/` (`vmem/no-engine-imports-convex`).

## Type safety

- Never `any`, never `as` type assertions, never non-null `!`.
- `unknown` only at parse/`catch` boundaries; narrow immediately with zod.
- Do not invent `Reflect.get` / `isRecord` / field-reader ceremonies for lint —
  parse external JSON with zod at the boundary.
- Prefer `z.infer<typeof schema>` over a hand-written twin interface
  (`vmem/prefer-schema-inferred-types`).
- No inline `as { … }` / `as Record<string, unknown>`
  (`vmem/no-inline-object-type-assertion`).

## Style (agents)

- Early return over nested `else`.
- Prefer `const`; avoid reassignment `let` when a ternary or early return works.
- Do not extract a single-use helper unless it clarifies a large function.
- Happy-path-first: main flow at the top, helpers below.
- No AI co-author / Cursor attribution in commits or PRs.

## Learning files

Append short notes when you learn something durable:

- `MISTAKES.md` — wrong turns and how to avoid them
- `LEARNINGS.md` — env, tooling, or domain facts
- `DESIRES.md` — missing tools / context that would have helped

## Attribution

Never add Cursor, Claude, Anthropic, or Co-Authored-By attribution to commits,
PRs, or generated files.
