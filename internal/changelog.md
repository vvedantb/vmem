# Changelog

## 2026-07-15 — Simplify web lib parsers, filters, and URL state

Move Claude parsing into parseClaudeExport, drop list-item filter wrappers,
consolidate graph degree / cookie / tag / nuqs helpers, and remove dead
formatDateTime, daily-trend, and optimisticId surfaces.

## 2026-07-15 — Prune web graph and memory list hooks

Drop unused hook exports and return aliases, narrow codebase graph filters,
unify graph page merge, and replace timeline/version wrappers with tighter
memory-specific APIs.

## 2026-07-15 — Web canvas pointer events and spatial/sim trim

Unify canvas input on Pointer Events, drop spatial lastHash rebuilds, share
stopped-simulation + SLEEP_ALPHA across worker/main, delete the canvas types
barrel, and privatize EDGE_STYLE — with hit/viewport/physics characterization tests.

## 2026-07-15 — Simplify neo4j-cli benchmark and eval

Collapse bench seed into a single-process `eval:bench`, fold seed/query types
into the corpus module, drop synthetic MemoryEvents and stale eval docs, and
point live tests at production CRUD helpers.

## 2026-07-15 — Engine stage 4: utility cleanup

Linearize GitHub tarball extraction with `pipeline`, consolidate LLM JSON
parsing exports, map-based embedding validation, and light Neo4j helper
trims — with expanded characterization tests for archive and JSON edges.

## 2026-07-15 — Engine stage 3: simplify memory operations

Replace Cypher Builder memory updates with explicit SET fragments, tighten
graph/enrichment/proposal helpers, normalize mapper schemas, and add
characterization tests for unusual deletion, graph score, and tag behaviors.

## 2026-07-15 — Engine stage 2: simplify codebase graph pipeline

Parse context with in-parse import/heritage resolution, leaner call resolution
and entry detection (drop dead TanStack route branch), shared `withSession` on
read/write/impact, and characterization tests for parse/calls/entries/processes.

## 2026-07-15 — Engine stage 1: delete shallow modules

Inline codebase sync/error helpers into Convex, fold parsers and enrichment
vocabulary reads, move connector source types and `withSession` to their
natural homes, and drop dead `syncCodebaseInternal` / engine search wrapper.

## 2026-07-15 — Trim MCP catalog ceremony

Bind tools at registration time (drop precomputed bindable catalog), co-locate
profile mappers into toolsCore, share emptyInputSchema, and patch the wiki
folder path index in memory instead of refetching the tree.

## 2026-07-15 — Decompose Dream Mode pass helpers

Shared DreamRunResult helpers across entry points, split profile runs into
anomaly/merge/portrait passes, and dropped the duplicate public RunResult type.

## 2026-07-15 — Share HTTP respond + accessible-profile helpers

API-key auth uses a request-local `respond` closure for usage logging. Dashboard,
graph, proposals, file import, memoryApi, and HTTP share one accessible-profile
helper for team-scope / assert checks.

## 2026-07-15 — Simplify Convex skills/wiki/memory internals

Shared skill and wiki create/update/delete helpers across web and MCP
registrants. Unified memory list/search validators, patched connector tokens
in place, and collapsed GitHub connection upsert to one internal mutation.

## 2026-07-15 — Drop TanStack Query optimistic cache patches

Removed `onMutate` / rollback `onError` from memory create/update/delete and
related-memory unlink. Lists refresh via `invalidateQueries` on settle instead.

## 2026-07-15 — Reorganize web providers and loose components

Moved `providers/` and `contexts/` out of `components/` to top-level
`src/providers` and `src/contexts`. Tucked loose root components into domain
folders (`shell/`, `memories/`, etc.) so `components/` is domain-only.

## 2026-07-15 — Drop client optimistic mutation wrappers

Removed Convex `.withOptimisticUpdate` from web and the chrome extension.
Mutations are plain `useMutation(api.…)` again; deleted the `_optimistic*`
helper modules that only existed for those wrappers.

## 2026-07-15 — Nest web icon families under `components/icons`

Moved `brand-icons`, `svg-animations`, and `sidebar-icons` under
`components/icons/{logos,animations,sidebar}` and updated imports. No barrel
at `icons/`; connector logos under `public/` and canvas stay put.

## 2026-07-15 — Adopt usehooks-ts for common web utilities

Replaced hand-rolled localStorage, matchMedia, debounce, clipboard+timeout,
and OAuth interval/listener helpers with `useLocalStorage`, `useMediaQuery`,
`useDebounceValue`, `useCopyToClipboard`/`useTimeout`, and
`useInterval`/`useEventListener`/`useTimeout`.

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
