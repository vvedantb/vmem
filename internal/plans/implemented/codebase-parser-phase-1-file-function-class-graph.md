# Codebase Parser Phase 1 — File/Function/Class graph

## Context

Current parser at `packages/backend/src/neo4j/importParser.ts` is regex-only: extracts relative imports, emits `(:CodeFile)-[:IMPORTS]->(:CodeFile)`. Misses everything inside files — functions, classes, calls, heritage. Useless for the two consumers we want: (a) a meaningful graph view in `apps/web` and (b) AI memory tools that answer "what depends on X".

Goal: replace regex with **ts-morph** AST parsing. Add `Function`, `Class`, `Interface` nodes plus `CALLS` / `EXTENDS` / `IMPLEMENTS` / `CONTAINS` edges with confidence scoring. Build entry-point–rooted processes. Expose blast-radius queries. Render new node kinds in existing canvas viz with consolidated nuqs filters. Keep memory subgraph fully untouched (separate label scope by `userId, codebaseId`).

References analysed: GitNexus (TS, identical stack shape) and code-review-graph (Python, best algorithms — confidence tiers, surprise score, framework decorator entry points). iwe is markdown-focused — skipped.

Decisions locked with user: ts-morph (TS/JS only), Files+Functions/Classes granularity, separate subgraphs, viz+AI consumer, Phase 1 = Processes + Blast radius only (clustering deferred — directories already give meaningful grouping; Leiden/hubs/surprise/gaps all Phase 2).

---

## A) Schema

### A.1 Neo4j

Stable IDs use **qualified-name format**: `<codebaseId>:<relPath>:<symbolPath>`. Methods use `Class.method`. Top-level functions use bare name. Files: `<codebaseId>:<path>`. Processes: `<codebaseId>:p<n>`. Idempotent re-syncs (MERGE matches the same node), debuggable in raw Cypher.

**Node labels** — all scoped by `(userId, codebaseId)`:

```
(:CodeFile  { id, userId, codebaseId, path, directory, filename, extension,
              sizeBytes, contentHash, createdAt, updatedAt })
(:Function  { id, userId, codebaseId, filePath, name, qualifiedName,
              parentClass?, startLine, endLine,
              isExported, isAsync, isTest, paramCount,
              createdAt, updatedAt })
(:Class     { id, userId, codebaseId, filePath, name, qualifiedName,
              startLine, endLine, isExported, isAbstract,
              extendsName?, createdAt, updatedAt })
(:Interface { id, userId, codebaseId, filePath, name, qualifiedName,
              startLine, endLine, isExported, createdAt, updatedAt })
(:Process   { id, userId, codebaseId, name, entryPointId, entryKind,
              nodeCount, createdAt })
```

`entryKind`: `"convex_query" | "convex_mutation" | "convex_action" | "convex_internal" | "convex_http" | "tanstack_route" | "heuristic_main" | "event_handler" | "no_incoming"`.

**Edge types** — every edge has `confidence: number ∈ [0,1]`, `tier: "EXTRACTED"|"INFERRED"|"AMBIGUOUS"` (stored from day 1, rendered identically Phase 1, used by Phase 2 hub/surprise scoring):

```
(:CodeFile)-[:IMPORTS    { importPath, confidence, tier }]->(:CodeFile)
(:CodeFile)-[:CONTAINS                                    ]->(:Function|:Class|:Interface)
(:Class)   -[:HAS_METHOD                                  ]->(:Function)
(:Function)-[:CALLS      { callSiteLine, confidence, tier }]->(:Function)
(:Class)   -[:EXTENDS    { confidence, tier              }]->(:Class)
(:Class)   -[:IMPLEMENTS { confidence, tier              }]->(:Interface)
(:Function)-[:STARTS_PROCESS                              ]->(:Process)
(:Process) -[:INCLUDES                                    ]->(:Function)
```

Confidence policy: AST-resolved by ts-morph type checker = 1.0 / `EXTRACTED`; same-file name match (no resolved symbol) = 0.7 / `INFERRED`; multiple candidates = 0.4 / `AMBIGUOUS` (one edge per candidate). Structural edges (`CONTAINS`, `HAS_METHOD`, `INCLUDES`, `STARTS_PROCESS`) carry no confidence.

**Indexes/constraints** — extend `packages/backend/src/neo4j/setup.ts` (additive, all `IF NOT EXISTS`):

```cypher
-- Uniqueness
CREATE CONSTRAINT codefile_id  IF NOT EXISTS FOR (n:CodeFile)  REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT function_id  IF NOT EXISTS FOR (n:Function)  REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT class_id     IF NOT EXISTS FOR (n:Class)     REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT interface_id IF NOT EXISTS FOR (n:Interface) REQUIRE n.id IS UNIQUE;
CREATE CONSTRAINT process_id   IF NOT EXISTS FOR (n:Process)   REQUIRE n.id IS UNIQUE;
-- Scope filters
CREATE INDEX codefile_scope IF NOT EXISTS FOR (n:CodeFile)  ON (n.userId, n.codebaseId);
CREATE INDEX function_scope IF NOT EXISTS FOR (n:Function)  ON (n.userId, n.codebaseId);
CREATE INDEX class_scope    IF NOT EXISTS FOR (n:Class)     ON (n.userId, n.codebaseId);
CREATE INDEX iface_scope    IF NOT EXISTS FOR (n:Interface) ON (n.userId, n.codebaseId);
CREATE INDEX proc_scope     IF NOT EXISTS FOR (n:Process)   ON (n.userId, n.codebaseId);
-- Lookup
CREATE INDEX function_qname IF NOT EXISTS FOR (n:Function) ON (n.userId, n.codebaseId, n.qualifiedName);
CREATE INDEX function_name  IF NOT EXISTS FOR (n:Function) ON (n.userId, n.codebaseId, n.name);
CREATE INDEX class_name     IF NOT EXISTS FOR (n:Class)    ON (n.userId, n.codebaseId, n.name);
-- Symbol full-text search (used by Phase 1 search box; cheap to add now)
CREATE FULLTEXT INDEX code_symbol_search IF NOT EXISTS
  FOR (n:Function|Class|Interface) ON EACH [n.name, n.qualifiedName];
```

### A.2 Convex

Extract existing inline `codebases` table at `packages/backend/convex/schema.ts:182-205` into `codebaseFields` in `packages/backend/convex/validators.ts` (matches existing `profileFields` / `wikiNodeFields` pattern). Add new optional fields — no migration needed since all are optional:

```ts
// packages/backend/convex/validators.ts (NEW export)
export const codebaseFields = {
  // ...existing 11 fields unchanged...
  // NEW Phase 1 stats — all optional so existing rows stay valid
  functionCount: v.optional(v.number()),
  classCount: v.optional(v.number()),
  interfaceCount: v.optional(v.number()),
  callEdgeCount: v.optional(v.number()),
  processCount: v.optional(v.number()),
  parserVersion: v.optional(v.string()), // "1.0.0" — bump triggers re-sync banner
  lastParseError: v.optional(v.string()),
  parseStage: v.optional(
    v.union(
      v.literal("fetching"),
      v.literal("parsing"),
      v.literal("processes"),
      v.literal("writing"),
      v.literal("done"),
    ),
  ),
};
```

`schema.ts` switches to `defineTable(codebaseFields)`. `updateStatusInternal` in `codebases.ts` extends to accept the new fields.

---

## B) Parser module structure

New directory `packages/backend/src/neo4j/codebase/`. All pure TypeScript (no Convex imports — composed by the `"use node"` action).

| File                            | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | LoC est        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `codebase/types.ts`             | Discriminated unions: `SymbolNode = FileNode \| FunctionNode \| ClassNode \| InterfaceNode`, `RelationEdge` with `kind/confidence/tier`, `ParseResult`.                                                                                                                                                                                                                                                                                                                                                   | ~120           |
| `codebase/parse.ts`             | ts-morph `Project` with `useInMemoryFileSystem: true`. Walks each `SourceFile` → emits Function (incl. arrow-fn assigned to const), Method, Class, Interface symbols + `CONTAINS` / `HAS_METHOD` / `EXTENDS` / `IMPLEMENTS` structural edges. Detects `isTest` (filename `.test`/`.spec` + sibling `describe/it`). Exports `parseRepository(files): { project, symbols, structuralRelations }`.                                                                                                           | ~220           |
| `codebase/resolveCalls.ts`      | For each `CallExpression`, uses `TypeChecker.getSymbolAtLocation(callee)` → declaration → emit `CALLS` edge `EXTRACTED`/1.0. External symbols (node_modules) skipped. Unresolved → fallback to file-local imported-name match `INFERRED`/0.7. Multiple candidates → one edge per candidate `AMBIGUOUS`/0.4. Exports `resolveCalls(project, symbols)`.                                                                                                                                                     | ~150           |
| `codebase/entryPoints.ts`       | Pattern matchers. Convex: callee identifier of variable initializer matches `query`/`mutation`/`action`/`internalQuery`/`internalMutation`/`internalAction`/`httpAction`/`authQuery`/`authMutation`/`authAction`. TanStack: `createFileRoute(...)` calls. Heuristic names: top-level `main`, `handler`, `start`, `on*`. Plus: any exported function with zero incoming `CALLS`. Exports `detectEntryPoints(symbols, calls): EntryPoint[]`.                                                                | ~140           |
| `codebase/processes.ts`         | For each `EntryPoint`, BFS forward in directed `CALLS` graph, depth ≤ 8. Returns `Process[]` with reachable node IDs. Names: Convex/TanStack → `<filePath>::<exportName>`; heuristic → entry function's qualified name. Exports `detectProcesses(entryPoints, calls)`.                                                                                                                                                                                                                                    | ~90            |
| `codebase/impact.ts`            | Read-time helper. Single Cypher with bounded variable-length traversal: `MATCH (start { id: $symbolId, userId: $userId, codebaseId: $codebaseId }) MATCH path = (start)<-[:CALLS*1..$depth]-(caller) RETURN DISTINCT caller.id AS id, length(path) AS distance`. Same forward for downstream. Default depth 5. Exports `getUpstreamImpact` / `getDownstreamImpact`.                                                                                                                                       | ~80            |
| `codebase/write.ts`             | Bulk write. Chunks of 500. Order: deleteStale → upsert files → upsert functions → upsert classes → upsert interfaces → upsert IMPORTS → upsert CALLS → upsert HAS_METHOD/EXTENDS/IMPLEMENTS → upsert processes → STARTS_PROCESS/INCLUDES. `UNWIND $rows MERGE (n:Label { id: row.id }) SET n += row.props`. `deleteStale`: `MATCH (n {userId, codebaseId}) WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process) AND NOT n.id IN $keepIds DETACH DELETE n`. Exports `writeParseResult`. | ~200           |
| `codebase/read.ts`              | Read-side helpers: `getGraphOverview`, `getProcessMembers`, `getSymbolContext`, `searchSymbols(query, kind?)`. Each parameterised Cypher (no string interp).                                                                                                                                                                                                                                                                                                                                              | ~180           |
| `codebaseService.ts` (refactor) | Thin orchestrator. `syncCodebase(userId, codebaseId, files)` calls parse → resolveCalls → detectEntryPoints → detectProcesses → writeParseResult. `getCodebaseGraph` becomes thin wrapper over `read.ts::getGraphOverview`. `deleteCodebase` extends label list.                                                                                                                                                                                                                                          | shrinks to ~80 |
| `importParser.ts`               | Demoted: rewrite internals to use ts-morph's `getImportDeclarations()` (cleaner than regex; gets named bindings + dynamic imports). Kept as a re-export for back-compat.                                                                                                                                                                                                                                                                                                                                  | ~50            |

Parser version constant: `export const PARSER_VERSION = "1.0.0";` in `codebase/parse.ts`. Bumped on schema change → triggers re-sync banner.

---

## C) Action flow rewrite

`packages/backend/convex/neo4jActions/codebases.ts::syncCodebaseInternal` reorganised into named helpers (~250 lines total). Each step patches `parseStage` for live UI feedback via `useQuery` on `codebases.getById`.

```ts
// Step 1 — fetchRepository(): existing tree+content fetch, parseStage="fetching" → returns { files }.
// Step 2 — parseRepository(files): parseStage="parsing" → { project, symbols, structuralRelations }.
// Step 3 — resolveCalls(project, symbols): → calls[].
// Step 4 — detectEntryPoints + detectProcesses: parseStage="processes" → processes[].
// Step 5 — writeParseResult(getDriver(), userId, codebaseId, ...): parseStage="writing" → stats.
// Step 6 — return stats. The caller (codebases.syncCodebase) patches the codebases row with stats + parserVersion + parseStage="done".
```

**Repo-size guard**: at start of step 2, hard-error if `files.length > 3000`. Message: "Repository too large for Phase 1 sync — chunked sync coming in Phase 3." Caught by `syncCodebase` and surfaced as `lastParseError`.

**Convex limits** — 10 min / 256 MB:

- ts-morph in-memory project: ~3–5× source size. 10 MB TS → ~50 MB heap. Fine for the 3000-file cap.
- Chunk size 500 keeps each transaction well under Neo4j's 4 MB cap.
- GitHub fetch already batched at 20 (existing).

---

## D) Web changes

### D.1 Renderer & data plumbing

- `apps/web/src/components/_components/canvas/types.ts` — extend `GraphNodeKind` union with `"code-file" | "code-function" | "code-class" | "code-interface" | "code-process"`. Extend `GraphEdgeType` with `"calls" | "contains" | "extends" | "implements" | "starts_process"`.
- `apps/web/src/components/_components/canvas/renderer.ts` — add kind→shape mapping: file=square, function=circle, class=hexagon, interface=diamond, process=starburst. Existing shape helpers reused.
- `apps/web/src/components/_components/canvas/graph-colors.ts` — add palette entries for the new kinds (theme-aware, follow tonal hierarchy rules — no borders).

### D.2 Convex API for reads

`packages/backend/convex/codebaseSymbols.ts` (new file). Each function calls a corresponding `internalAction` in `convex/neo4jActions/codebases.ts` to cross the V8→Node boundary:

```ts
// All authenticated. Each delegates to internal Neo4j actions.
export const getOverview     = authAction({ args: { codebaseId: v.string() }, ... });
export const getGraph        = authAction({ args: { codebaseId, kinds?, processId?, blastRadiusOf?, depth? }, ... });
export const getContext      = authAction({ args: { codebaseId, symbolId },   ... });
export const getImpact       = authAction({ args: { codebaseId, symbolId, direction: "upstream"|"downstream", depth? }, ... });
export const searchSymbols   = authAction({ args: { codebaseId, query, kind?, limit? }, ... });
```

Internals in `neo4jActions/codebases.ts`: `getCodebaseGraphInternal` (replace existing) + new `getSymbolContextInternal`, `getImpactInternal`, `searchSymbolsInternal`.

### D.3 Hooks (nuqs-driven, no `useState` for filters)

- `apps/web/src/hooks/useCodebaseGraphController.ts` — replace local-state filters with `useQueryStates`:
  ```ts
  const [filters, setFilters] = useQueryStates(
    {
      kinds: parseAsArrayOf(parseAsString).withDefault([
        "code-file",
        "code-function",
        "code-class",
      ]),
      processId: parseAsString,
      blastRadiusOf: parseAsString,
      blastDirection: parseAsStringEnum(["upstream", "downstream"]).withDefault(
        "upstream",
      ),
      search: parseAsString.withDefault(""),
    },
    { history: "replace" },
  );
  ```
  Selected-symbol id stored in same `blastRadiusOf` URL param so the panel and graph stay in sync. Existing `activeDirectories` retained client-side.
- `apps/web/src/hooks/useCodebaseGraphData.ts` — split into two TanStack Queries: `getOverview` (fast, badge stats) + `getGraph` (filter-driven, full payload).

### D.4 Components

- `apps/web/src/components/codebases/codebase-graph-data.ts` — generalise `buildCodebaseGraphData` to accept the new union of node kinds. Compute degree per kind for size scaling. When `blastRadiusOf` is set, the API returns only the impacted set; frontend visualises by setting `searchMatchSet` to that set (reuses existing highlight effect — no new code path).
- `apps/web/src/components/codebases/CodebaseGraph.tsx` — minor edits, stays under 250 lines.
- `apps/web/src/components/codebases/CodebaseGraphHeaderControls.tsx` — consolidate filters into one `Filters` dropdown per CLAUDE.md UI rules (Kinds + Process + Directory; search + sort/view stay separate). Active-count badge counts each non-default field as 1.
- `apps/web/src/components/codebases/CodebaseDetailPanel.tsx` → rename to `CodebaseSymbolPanel.tsx`. Sections: header (icon + qualified name + file link), metadata (lines, exported, async, isTest, processes), Calls In / Calls Out (clickable → updates `blastRadiusOf`), "Show blast radius" button (toggles direction).

### D.5 Route page

`apps/web/src/routes/_main/codebases/$id.tsx` — header stat line shows `<files>/<fns>/<classes>/<processes>` from `getOverview`. Re-sync banner on `/codebases` index when any row's `parserVersion !== PARSER_VERSION`.

---

## E) AI memory integration (Phase 1 surface)

The Convex functions in §D.2 are the AI-queryable interface. `apps/mcp/` wraps them as MCP tools in a follow-up — out of scope for Phase 1.

Tool sketches the MCP layer will eventually expose (using the same Convex functions):

- `vmem_codebase_search({ codebaseId, query, kind? })` → `searchSymbols`
- `vmem_codebase_context({ codebaseId, symbolId })` → `getContext`
- `vmem_codebase_impact({ codebaseId, symbolId, direction })` → `getImpact`

---

## F) Migration

No Convex field deletions → no Convex migration. New optional fields only.

Neo4j `setup.ts` updated additively. No destructive changes to existing `(:CodeFile)-[:IMPORTS]->(:CodeFile)` schema; new parser still emits `IMPORTS` (now with `confidence`/`tier`). Old edges without those props read as `null`, handled in queries via `coalesce(rel.confidence, 1.0)`.

Re-sync UX:

- New `syncAllMy` `authAction` in `codebases.ts` — iterates user's codebases and calls `syncCodebase` for each.
- Banner on `/codebases` index when any row's `parserVersion !== PARSER_VERSION`. Click → runs `syncAllMy`.
- Manual trigger only — no automatic re-sync on deploy.

---

## G) Critical files to modify

| Path                                                                                                        | Change                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/backend/convex/validators.ts`                                                                     | Add `codebaseFields` export                                                                                  |
| `packages/backend/convex/schema.ts`                                                                         | `codebases: defineTable(codebaseFields)` (replace inline)                                                    |
| `packages/backend/convex/codebases.ts`                                                                      | Extend `updateStatusInternal` args; add `syncAllMy`                                                          |
| `packages/backend/convex/codebaseSymbols.ts`                                                                | NEW — public auth actions for symbol reads                                                                   |
| `packages/backend/convex/neo4jActions/codebases.ts`                                                         | Rewrite `syncCodebaseInternal`; add `getSymbolContextInternal`, `getImpactInternal`, `searchSymbolsInternal` |
| `packages/backend/src/neo4j/setup.ts`                                                                       | Add new constraints + indexes + fulltext index                                                               |
| `packages/backend/src/neo4j/codebaseService.ts`                                                             | Slim to orchestrator                                                                                         |
| `packages/backend/src/neo4j/importParser.ts`                                                                | Rewrite internals to use ts-morph                                                                            |
| `packages/backend/src/neo4j/codebase/{types,parse,resolveCalls,entryPoints,processes,impact,write,read}.ts` | NEW — 8 files                                                                                                |
| `packages/backend/package.json`                                                                             | Add dep: `ts-morph`                                                                                          |
| `apps/web/src/components/_components/canvas/types.ts`                                                       | Extend node/edge kind unions                                                                                 |
| `apps/web/src/components/_components/canvas/renderer.ts`                                                    | Kind→shape mapping                                                                                           |
| `apps/web/src/components/_components/canvas/graph-colors.ts`                                                | Palette entries                                                                                              |
| `apps/web/src/components/codebases/CodebaseGraph.tsx`                                                       | Use new data shape                                                                                           |
| `apps/web/src/components/codebases/CodebaseGraphHeaderControls.tsx`                                         | Consolidated `Filters` dropdown (per UI rules)                                                               |
| `apps/web/src/components/codebases/CodebaseDetailPanel.tsx`                                                 | Rename → `CodebaseSymbolPanel.tsx`; new sections                                                             |
| `apps/web/src/components/codebases/codebase-graph-data.ts`                                                  | Multi-kind builder                                                                                           |
| `apps/web/src/hooks/useCodebaseGraphController.ts`                                                          | nuqs filters                                                                                                 |
| `apps/web/src/hooks/useCodebaseGraphData.ts`                                                                | Split overview/graph queries                                                                                 |
| `apps/web/src/routes/_main/codebases/$id.tsx`                                                               | Stats line + symbol panel wiring                                                                             |
| `apps/web/src/routes/_main/codebases/index.tsx`                                                             | Re-sync banner                                                                                               |

---

## H) Verification (visual only — no curl)

1. From `/codebases`, click "Add Repository" → pick a small repo of yours (vmem itself, ~80 TS files, dogfood).
2. Click into the codebase. Hit **Sync**. Status badge transitions `pending → syncing → synced`. The new `parseStage` field flickers through `fetching → parsing → processes → writing → done` (live `useQuery`).
3. After sync, header stats show non-zero `<files>/<fns>/<classes>/<processes>`.
4. Graph renders: squares = files, circles = functions, hexagons = classes, diamonds = interfaces, starbursts = processes.
5. Open Filters → set "Kinds" to only `code-function`. Graph reduces to functions; edges become `CALLS` only. URL gains `?kinds=code-function`.
6. Click any function node. Right panel shows file, calls in/out, processes.
7. Click "Show blast radius". Graph re-queries with `blastRadiusOf=<id>` in URL. Impacted callers highlighted via existing `searchMatchSet` path.
8. Click a Process in Filters → graph reduces to that process's BFS frontier (e.g. "everything `httpAction handler` touches").
9. Push a new commit to the repo (rename a function on GitHub). Hit **Sync** again. Old node ID gone (verified by clicking previous selection — panel 404s); new node present; processes re-detected.
10. From `/codebases` index: bump `PARSER_VERSION` locally to `"1.0.1"`, deploy → re-sync banner appears → click → all repos re-synced.
11. Sanity-check Convex API surface: in the Convex dashboard, run `codebaseSymbols:searchSymbols { codebaseId, query: "validate" }` → returns matching functions. Verifies the AI memory consumer surface works end-to-end before MCP wrap-up.

---

## I) Decisions baked in

| Decision                  | Choice                                            | Why                                                                                                                                              |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stable IDs                | Qualified-name `<codebaseId>:<path>:<symbolPath>` | Idempotent re-syncs, debuggable, matches code-review-graph                                                                                       |
| `is_test` on Function     | Yes, day 1                                        | Free during parse; needed by Phase 2 blast radius "test gap"                                                                                     |
| Confidence tiers on edges | Yes, store day 1, ignore in viz Phase 1           | Two extra props per edge; saves a re-sync when Phase 2 lights up tier-aware rendering                                                            |
| `OVERRIDES` edges         | Defer to Phase 2                                  | Store `Class.extendsName` now (cheap, used for `EXTENDS` anyway) — Phase 2 hydrates `OVERRIDES` without re-parse                                 |
| Repo size cap             | 3000 files, hard error                            | Convex 10-min ceiling; chunked sync is Phase 3                                                                                                   |
| Clustering                | Skipped in Phase 1                                | Directories already give meaningful grouping; Leiden adds 3 deps + complexity for marginal Phase 1 value. Revisit in Phase 2 if viz feels noisy. |
| Re-sync trigger           | Manual via banner                                 | Safer than auto-on-deploy                                                                                                                        |
| Dashboard stats           | Per-detail page only                              | Index page stays clean; new stats only matter once you click in                                                                                  |

---

## J) Unresolved questions for the user

None blocking — but these would refine the rollout if you have an opinion:

1. **Search box behaviour** when `code-symbol-search` fulltext index returns 0 hits — fall back to substring match on names, or just show "no results"?
2. **Process auto-naming** when a Convex action both has `httpAction` framing and is wrapped in `authAction` — pick `convex_http` or `convex_action`? (Defaulting to `convex_http` since the HTTP wrap is the entry surface.)
3. **Blast radius default depth** — code-review-graph uses 2, GitNexus suggests 5. I've defaulted to 5 for richer initial UX. Override?
