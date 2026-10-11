FOLLOW ALL OF THESE RULES

## Git / ship
- NEVER create a new branch, push, or open a PR unless the user asks.
- If already on main and the user asks to ship: commit and push directly to main.
- Husky is active. `.husky/pre-commit` runs lint-staged (prettier). `.husky/pre-push` runs `pnpm typecheck:all`, then `node scripts/compiler-check.mjs`.
- Pre-push uses local `tsc` only. Never run `convex codegen` there: codegen uploads to the linked deployment.

## Always
- Greenfield OK — breaking changes fine.
- Implementing from an agreed plan: just implement.
- Think first; simplest solution wins. Ask when unsure / ambiguous — as many questions as needed.
- Prefer a detailed plan over a quick one. Plan mode: concise plans; list unresolved questions; use AskUserQuestion to interview until shared understanding.
- Explain changes when done. Check web/docs when needed.
- Communicate in ASD-STE100 Simplified Technical English, about 80%: short one-idea sentences, active voice, literal words; keep technical terms and reasons.
- Only edit this file when the user explicitly asks. Entries: 1 sentence (~20 words max), not changelog paragraphs.
- No `any`, `unknown`, `as`, or non-null `!`. No `isRecord(object: unknown)` — parse at the boundary (Zod). Hard types → rethink design.
- Prefer simplicity, small diffs, co-location, explicit behavior, long-term maintainability. No premature abstractions. No new deps unless necessary.
- Do not default to `useState`/`useRef` — pick the right state ownership first.
- useCallback and useMemo are banned as React Compiler is enabled (`apps/web` uses `react({ compiler: true })` + oxc-transform-react; the WXT extension is also React).
- Avoid useEffect; use it only when absolutely necessary (it invites performance regressions), preferring derived state, event handlers or `useSyncExternalStore`.
- Never call a component as a function in render; name hook-calling helpers `use*` (the compiler memoises capitalised calls and skips them).
- Compiler bailouts: check `scripts/compiler-check.mjs` against its baseline. oxlint rule `no-value-block-in-try` applies.
- Do not run dev / lint / build unless the user asks.
- After medium+ changes: no banned types; `tsc` where relevant.
- Never run `npx convex dev` or `npx convex deploy` in agent sessions. Use codegen for typechecking (see `packages/backend/convex/README.md`).
- Eliminate duplication, centralise your changes so its easier to update them
- For debugging, use vmem MCP and Convex CLI for prod logs (prod deployment `clear-bear-690`, eu-west-1).

## Domain docs (read when relevant)
- Frontend / UI work → `apps/web` (Vite, TanStack Router, nuqs, `@vvedantb/ui` / `@vvedantb/shell`); docs site `apps/docs` (Mintlify, `pnpm docs:dev`)
- Convex / schema / migrations → `packages/backend/README.md`, `packages/backend/convex/README.md`, `apps/docs/architecture.mdx`, `apps/docs/environment.mdx`
- Chrome extension → `apps/chrome-extension/README.md`
- agent-browser on vmem web → navigate to `/?agent` (auto sign-in; needs `CLERK_SECRET_KEY` + `AGENT_CLERK_USER_ID` in `apps/web/.env.local`)
- E2E → `e2e/README.md` (prod `vmem.projectv.uk`, Convex `clear-bear-690`)

## Product facts
- vmem is a universal LLM memory layer: one shared, inspectable memory graph across sessions and providers. Not a sandbox/codebase runner. Not an agent OS.
- Stack: pnpm workspace (pnpm 10.15.1, Node 20+). Shared types in `@vmem/shared`. SDK is `@vmem/sdk`.
- Clients: `apps/web` dashboard; `apps/chrome-extension` (WXT MV3: save pages, inject context); MCP at `https://<deployment>.convex.site/mcp` (Clerk OAuth; team at `/mcp/team`; personal also `vmem://context_prompt`); HTTP `/api/v1/memories/*` with Bearer `vmem_sk_…`.
- Backend: `packages/backend` Convex (memories, auth, profiles, teams, skills, wiki, connectors, MCP HTTP). Memory runtime is Convex only — no Neo4j on main.
- Hosting: prod web `https://vmem.projectv.uk` (on Vercel); `vmem.vedantb.com` permanently redirects there. Staging: `https://vmem-staging.vedantb.com`.
- Convex prod: `clear-bear-690` (`https://clear-bear-690.eu-west-1.convex.cloud` / `.convex.site`). The extension source fallback is `outgoing-reindeer-268` (not prod); production extension env must use `clear-bear-690`.
- Auth: Project V Clerk. Prod `clerk.projectv.uk` (`pk_live_Y2xlcmsucHJvamVjdHYudWsk`). Preview/dev `allowing-coyote-80.clerk.accounts.dev`.
- UI packages: npm `@vvedantb/ui`, `@vvedantb/shell`, `@vvedantb/tokens`. No `@vvedantb/native-ui` on main; Expo mobile is archived (`archive/mobile`). `packages/ui` in README.txt is stale.
- Web surfaces: memories (list/graph/timeline/tags), inbox (proposals + notifications), wiki, skills, sources/connectors/import, files, teams, settings (API keys, extension, profiles, preferences).
- `/slides` is public (password for presenter pop-out). It skips ClerkProvider because Vercel preview hosts often return 400 on `clerk.projectv.uk`.
- Landing has "Continue without an account". Dev: `/?agent` auto sign-in.
- Memory list is paginated and bounded. Do not reintroduce app-wide 1000-row reactive memory queries.
- Retrieval: hybrid (Convex FTS, lexical, recency, temporal, optional vector) plus Jev rerank of top 20 when `AI_GATEWAY_API_KEY` is set on the Convex deployment.
- Instruction store/update needs that key, else HTTP 422 `openrouter_required`. `summarize: true` joins titles, no LLM. No in-app Secrets page.
- Dream Mode creates inbox merge proposals. Conflicting updates become proposals.
- Connectors: Google Drive/Gmail, Notion, Figma, GitHub. Callback `https://<CONVEX_SITE_URL>/api/auth/connector/callback`.

Fight entropy. Leave the codebase better than you found it.
