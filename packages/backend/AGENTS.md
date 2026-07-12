# Backend package notes

Read root [AGENTS.md](../../AGENTS.md) first.

## Layout

| Path         | Role                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `convex/`    | Registered Convex queries/mutations/actions + orchestration + prompts + `cloudLib/`                                      |
| `engine/`    | Neo4j / codebase / parsers — provider-agnostic. Import only from `"use node"` actions. Never import `convex/` from here. |
| `neo4j-cli/` | Seed / eval / unseed scripts                                                                                             |
| `tests/`     | Unit tests importing `engine/` or `convex/`                                                                              |

## Public API

- `@vmem/backend` exports `api`, `internal`, and Convex document types only.
- Apps must not deep-import `@vmem/backend/...`.

## Typecheck

```bash
pnpm --filter @vmem/backend typecheck
```

Refresh `_generated/` with `pnpm convex` (dev) when schema/functions changed and
codegen is stale.
