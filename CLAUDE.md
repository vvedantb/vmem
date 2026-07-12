# CLAUDE.md

Follow [AGENTS.md](./AGENTS.md) first.

This file holds vmem-specific implementation rules. Keep it concise; put durable
mistakes/learnings in `MISTAKES.md` / `LEARNINGS.md` / `DESIRES.md`.

## Implementation

- Greenfield OK — breaking changes fine when intentional.
- Prefer simplicity over cleverness; minimize surface area of change.
- Co-locate logic where it naturally belongs; avoid premature abstractions.
- Prefer explicit over magical behaviour.
- Never use `any`. Prefer `unknown` only at parse/`catch` boundaries, then
  zod-narrow immediately.
- Never use `isRecord` (ESLint-banned). Never `as`. Never non-null `!`.
- Always top-level `import` / `import type` — no dynamic `import()`.
- Do not run dev / lint / build unless asked — except when the task is to adopt
  lint/CI gates or the user asks to verify (`pnpm check`).
- Plans end with `/ship` unless the user says not to.

## Convex

- Types from `Doc<>`, `Id<>`, `FunctionReturnType<typeof api.…>` — never hand-rolled doc interfaces.
- Table fields: exported `xxxFields` in `validators.ts` → schema + return validators.
- Backend layout: `convex/` = registered functions; `engine/` = Neo4j/parsers
  (imported only from `"use node"` actions); `neo4j-cli/` = seed/eval; `tests/` = unit tests.
- Client apps import only `@vmem/backend` and `@vmem/shared` — never `@vmem/backend/*`.

## UI (tonal surface hierarchy)

- No shadows on inline elements; shadows only on floating overlays.
- No borders for layout separation — use surface token contrast.
- Inline list rows: flat by default; background only on hover/selected.
- Detail pages: `PageContainer` breadcrumb, not a back button.
- Filters vs sort vs view: consolidate real filters into one Filters dropdown;
  use nuqs for filter/sort URL state.

## Product scope

- vmem = memory/context layer only. Connectors ingest into Neo4j memories —
  not live app-action platforms.
