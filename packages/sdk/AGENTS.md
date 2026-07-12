# SDK package notes

Read root [AGENTS.md](../../AGENTS.md) first.

- Published package: parse HTTP/JSON at boundaries with zod; no `any` / `as` / `!`.
- Build before publish: `pnpm sdk:build`. Typecheck: `pnpm sdk:typecheck`.
- Keep the public surface small; prefer additive exports over breaking renames.
