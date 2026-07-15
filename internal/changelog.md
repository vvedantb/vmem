# Changelog

## 2026-07-15 — Web app structure simplification

Moved graph helpers and URL search schemas into `lib/`, extracted fat
preferences/profiles/activity surfaces into components, and shared metric
cards, confirm dialogs, and list-filter helpers across dashboard and settings.
Sidebar `navView` is URL-derived; wiki/skills/teams use shared optimistic
helpers and destructive confirms. `DestructiveConfirmDialog` now supports
typed confirm and covers memory/file/env/wiki/system-skill deletes.
Upload surfaces use `react-dropzone` instead of hand-rolled drag handlers.
Skill create/edit dialogs share a `SkillFormShell` for fields and footer.
UnifiedFilterPanel tabs share filter row/header primitives.
Dropped Next.js `"use client"` directives from the Vite web app,
`packages/ui`, and the extension popup. Activity LLM spend lives at
`/activity/usage`; legacy `/ai-logs` and `/openrouter-logs` redirects are gone.
Extension adopts Clerk SW Convex tokens, zod message unions, and
`usehooks-ts` in the popup.

## 2026-07-14 — Memory API contract alignment

HTTP memory routes and MCP memory tools share one zod contract for create,
retrieve, update, and delete payloads. The public structured update/delete id
field is now `id`; SDK response validators match backend memory fields and
contract tests guard the API/MCP/SDK shape.

## 2026-07-14 — Wiki artifacts kind

Artifacts are a third `wikiNodes.kind` (with optional `language`), editable via
existing wiki MCP tools. Web adds create/list/tree support and a sandboxed
HTML/SVG preview (`allow-scripts` only; team artifacts require Run preview).

## 2026-07-14 — Backend parser/base64 dependency trim

LLM JSON extraction uses `json-from-llm` to locate model payloads and keeps
`jsonrepair` for malformed JSON repair. Convex base64/base64url helpers use
`@scure/base`; Lucene escaping, prompt truncation, and embedding response
validation now share single helpers across backend call sites.

## 2026-07-14 — Comment style pass (web, extension, backend)

Trimmed verbose JSDoc/`/**` essays to short lowercase `//` comments with no
trailing full stops across `apps/web`, `apps/chrome-extension`, and
`packages/backend` (skipped `_generated`).

## 2026-07-14 — Chrome extension popup composition pass

Shared `useBrowserDefaultProfile` + `ProfileSelect` across Save/Settings,
derived effective profile id at render (no hydrate effect), flattened
QuickSave's tab/save flow, and extracted `AnimatedTabPanel`.

## 2026-07-14 — MCP + HTTP memory co-location

MCP tools co-locate schema, handler, and presentation in per-domain modules
(`toolsCore` / `toolsMemory` / …); deleted the old schemas + handlers split.
HTTP `/api/v1/memories` schemas live next to their route handlers.

## 2026-07-14 — Backend MCP catalog + graph hop collapse

MCP tools carry presentation (description, scopes, toContent) on one catalog;
handlers throw and `registerMcpTool` maps errors. Dropped the `mcp/graph`
internalAction hop — `memoryGraphApp` calls `getMemoryGraphForMcp` directly.
`neo4jActions/mcp` forwards patches/limits via spreads.

## 2026-07-14 — Web composition + lazy-load pass

Applied Vercel composition / React 19 patterns on the SPA: explicit variants
over boolean props (connectors, skills/wiki selection, team tabs, file empty
state, memory detail actions), `use()` for context consumers, and `ref` as a
prop on `GraphCanvas`. Lazy-loaded heavy routes and panels (memory graph,
wiki editor/history, playground, activity headers, codebase graph, sidebar
create dialogs). Parallelized file upload and import batches; command palette
skips queries until opened.

## 2026-07-13 — Octokit + zod OpenRouter / GitHub glue

GitHub OAuth uses `@octokit/oauth-methods` + shared `@octokit/core` client.
OpenRouter feature/endpoint/error enums are zod SSOT via `zodToConvex`; dropped
hand-rolled transient-error classifiers in favor of plain `p-retry`. Shared
`parseHHMM`, MIME helpers, and memory-event validators trimmed duplicate glue.

## 2026-07-13 — Drop unused Neo4j migration actions

Removed one-shot backfill/retag/dedup/entity-alias Convex actions. Kept
profile move/delete helpers used by profile and team lifecycle. Slimmed
`engine/neo4j/memory/migration.ts` to those live paths plus `setEmbeddings`.

## 2026-07-13 — Backend parser/retry library swaps

Notion sync pulls page markdown via SDK v5 (`retrieveMarkdown`) instead of a
hand-rolled block walker. PDF extraction uses `unpdf`; wiki plain-text uses
`remove-markdown`; OpenRouter embeddings, CLI embeddings, and GitHub fetches
share `p-retry`.

## 2026-07-13 — Single internal retrieval bench

Removed `eval:retrieval`, `db:seed:eval`, and the 8-query regression harness.
`db:seed:bench` + `eval:bench` is the only Neo4j retrieval eval path.

## 2026-07-12 — Sidebar + memory list UI polish

Eva-style shared hover pill on sidebar nav (one `layoutId` per nav tree; section
headers no longer pick up row hover bg). Memory/tags lists: source icons left,
tag dot + muted date right, 50/50 tags split, retrieve-backed search unchanged.
Sidebar footer stats: compact custom bar with today left / total right (no card
chrome). Brand icons for Cursor MCP and Chrome extension provenance.

## 2026-07-12 — Web Context Trace on memories search

Hybrid list search (`/memories/list?q=…`) now calls `retrieveMemories` instead
of faking 100% relevance from `listMemories`. Memory rows show relative scores
and a HoverCard breakdown (content, semantic, recency, confidence, chunk/entity)
with the retrieval reason. Browse mode (empty `q`) is unchanged.

## 2026-07-12 — Lint & agent quality gates

Adopted package-boundary and type-escape oxlint rules (cross-package relative
imports, deep `@vmem/*` imports, inline object assertions, zod-inferred types,
conditional test expects), tightened stock oxlint (duplicate/self imports,
consistent-type-imports, no-abusive-eslint-disable), added knip + plugin unit
tests to CI, and tracked AGENTS/CLAUDE/learning docs for shared agent contracts.
