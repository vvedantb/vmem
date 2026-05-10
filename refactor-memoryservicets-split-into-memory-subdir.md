# Refactor `memoryService.ts` — split into `memory/` subdir

## Context

`packages/backend/src/neo4j/memoryService.ts` is **4,367 lines** — one `MemoryService` class with 70+ methods covering CRUD, hybrid retrieval, proposals, graph viz, chunks, dedup, dream mode, analytics, timelines, and migration backfills. The class has no mutable state beyond `driver`.

Service-vs-action boundary is already clean: the 13 Convex action callers handle auth/orchestration; this file is pure mechanics. Problem is **size + cohesion**, not leakage.

Same dir already has the right pattern: `codebaseService.ts` (123 LOC) is a thin orchestrator that re-exports from `codebase/` subdir (`parse.ts`, `write.ts`, `read.ts`, `impact.ts`, `types.ts`). Mirror that.

Three functions are internally too long: `retrieveMemories` ~350L (3-leg hybrid + RRF + scoring), `resolveProposal` ~330L (6-kind dispatch), `getGraphData` ~170L (3 parallel-session reads). Decompose in place.

User-confirmed scope: full split, keep `memoryService.ts` as thin orchestrator (no caller churn), free functions w/ driver-first arg, **only** extract `profileFilter()` + `visibleStatusClause()` mechanics this pass — defer vector-search/semantic-edge/tag-merge helpers.

## Folder layout — `packages/backend/src/neo4j/memory/`

| File               | ~LOC | Contents                                                                                                                                                                                                                                                                                                            |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`         | ~120 | `MemoryType`, `MemoryStatus`, `MemoryNode`, `MemoryWithTags`, `MemorySnapshot`, `MemoryEvent`, `TimelineEvent`, `ConnectionType`, `ScoreBreakdown`, `MatchedChunk`, `MemoryCandidate`, `ProposedUpdateKind`, `ProposalSource`, `ProposedUpdateNode`, `TagEdge`, `ALL_PROPOSED_UPDATE_KINDS`, `isProposedUpdateKind` |
| `mappers.ts`       | ~140 | `toMemoryWithTags`, `toEventFromNode`, `toTimelineEvent`, `toTagEdge`, `toSnapshot`, `toMemoryTypeOrUndefined`, `toNeoInt`, `recencyFromAgeDays`, `rrfScore`, `normalizeForHash`, `computeContentHash`                                                                                                              |
| `shared.ts`        | ~80  | `withSession(driver, fn)`, `logEvent(session, …)`, `profileFilter(profileId, alias)` → `{clause, params}`, `visibleStatusClause(alias?, coalesce?)`, `VISIBLE_STATUSES` const                                                                                                                                       |
| `crud.ts`          | ~700 | `createMemory`, `getMemory`, `listMemories`, `updateMemory`, `deleteMemory`, `deleteAllMemoriesForUser`, `findMemoryByUrl`, `findMemoryByContentHash`, `findMemoryByExternalId`, `findMemoryBySimilarity`, `findMemoryByTitleAndOrigin`, `incrementVisitCount`                                                      |
| `chunks.ts`        | ~120 | `createChunksForMemory`, `deleteChunksForMemory`, `findUnchunkedLongMemories`                                                                                                                                                                                                                                       |
| `dedup.ts`         | ~280 | `deduplicateMemories`, `deduplicateBrowsingHistory`, `deleteJunkSessionEdges`                                                                                                                                                                                                                                       |
| `search.ts`        | ~120 | `searchMemories`, `getRecentMemoryTitles` (BM25 only — not the hybrid retrieve)                                                                                                                                                                                                                                     |
| `retrieve.ts`      | ~420 | `retrieveMemories` (decomposed below), `expandViaGraph`, `fetchMemoryMetadata`                                                                                                                                                                                                                                      |
| `graph.ts`         | ~340 | `getGraphData` (decomposed below), `getLocalGraph`, `getMemoryContent`                                                                                                                                                                                                                                              |
| `relationships.ts` | ~80  | `linkMemories`, `unlinkMemories`, `getRelatedMemories`                                                                                                                                                                                                                                                              |
| `proposals.ts`     | ~520 | `createProposal`, `createProposalForDelete`, `listProposedUpdates`, `resolveProposal` (decomposed below), `createSynthesisProposal`, `hasOverlappingPendingProposal`                                                                                                                                                |
| `dreamMode.ts`     | ~280 | `findRecentMemoriesForDream`, `computeSurprisalScore`, `fetchAnomalyCluster`, `materializeSynthesisAsMemory`                                                                                                                                                                                                        |
| `enrichment.ts`    | ~100 | `applyEnrichment`, `applyEntitiesOnly`                                                                                                                                                                                                                                                                              |
| `events.ts`        | ~80  | event-read helpers; re-exports `logEvent` from `shared.ts`                                                                                                                                                                                                                                                          |
| `stats.ts`         | ~250 | `getMemoryStats`, `getRecentActivity`                                                                                                                                                                                                                                                                               |
| `timeline.ts`      | ~120 | `getMemoryTimeline`, `getTopicTimeline`, `getSearchTimeline`                                                                                                                                                                                                                                                        |
| `connectors.ts`    | ~120 | `upsertFromSource`                                                                                                                                                                                                                                                                                                  |
| `migration.ts`     | ~430 | `count*`, `migrate*`, `listMissing*`, `set*`, `mark*` (all backfill helpers)                                                                                                                                                                                                                                        |
| `team.ts`          | ~150 | `listMemoriesForTeam`, `searchMemoriesInProfile`, `deleteTeamMemoryAsOwner`                                                                                                                                                                                                                                         |

`memoryService.ts` shrinks to ~80 LOC of re-exports — same shape as `codebaseService.ts:1-123`.

## API style — free functions, driver-first

```ts
export async function getMemory(
  driver: Driver,
  userId: string,
  id: string,
): Promise<MemoryWithTags | null>;
```

`withSession` becomes a free helper in `shared.ts`. `MemoryService` class deleted at the end. Convex actions already pass `driver` to other free helpers (e.g., `codebase/`), so this matches existing patterns.

## Mechanics extraction (this pass only)

### `profileFilter(profileId, alias)` → `{ clause, params }`

```ts
export interface FilterFragment {
  clause: string;
  params: { profileId?: string };
}
export function profileFilter(
  profileId: string | null | undefined,
  alias: string, // required, no default — typo at call site fails review
): FilterFragment;
// returns { clause: "AND (m.profileId = $profileId OR m.profileId IS NULL)", params: { profileId } }
// or     { clause: "", params: {} } when undefined/null.
```

Call sites: `listMemories` (memoryService.ts:1050-1053), `getMemoryStats` (~L2371-2374), `getRecentActivity` (~L2420-2423), `listMemoriesForTeam` (~L3816). `getMemoryStats` currently does `pf.clause.replace(/m\./g, "m2.")`; required `alias` removes that hack.

### `visibleStatusClause(alias?, coalesce?)` + `VISIBLE_STATUSES`

```ts
export const VISIBLE_STATUSES = ["active", "pinned"] as const; // ban "as" applies to type assertions, not const assertions — confirm w/ user if linter complains
export function visibleStatusClause(alias = "m", coalesce = true): string;
// "coalesce(m.status, 'active') IN ['active', 'pinned']"  or bare "m.status IN [...]"
```

10+ sites today — single source of truth so adding a new status (e.g., `archived`) is one edit.

**Defer this pass:** vector-search wrapper (8 sites but call shapes diverge), semantic-edge helper, tag-merge FOREACH helper. Re-evaluate after split exposes actual variation.

## Internal decomposition of large functions

### `retrieveMemories` (~350L → ~50L orchestrator + 5 helpers in `retrieve.ts`)

```ts
async function runFulltextLeg(
  session,
  params,
  profileFilter,
  legLimit,
): Promise<FtRow[]>;
async function runVectorLeg(
  session,
  params,
  profileFilter,
  legLimit,
): Promise<VecRow[] | null>;
async function runChunkLeg(
  session,
  params,
  profileFilter,
  legLimit,
): Promise<ChunkRow[] | null>;
function mergeLegsWithRRF(ft, vec, chunk): Map<string, MergedEntry>;
async function applyGraphExpansion(
  driver,
  merged,
  topSeeds,
  userId,
): Promise<void>; // mutates merged
function scoreAndRank(merged, params): MemoryCandidate[]; // owns RRF + reasons-string
```

`MergedEntry` interface stays local to `retrieve.ts` — never observed externally.

### `resolveProposal` (~330L → ~40L dispatch + 5 kind-handlers in `proposals.ts`)

```ts
async function lookupProposalContext(
  session,
  proposalId,
): Promise<ProposalLookup | null>;
async function applyUpdateApproval(
  session,
  lookup,
  now,
): Promise<ResolveResult>;
async function applyDeleteApproval(
  session,
  lookup,
  now,
): Promise<ResolveResult>;
async function applyDismissOnlyApproval(
  session,
  lookup,
  now,
): Promise<ResolveResult>; // contradiction + anomaly
async function applySynthesisApproval(
  session,
  lookup,
  now,
): Promise<ResolveResult>; // insight + connection
async function markProposalResolved(
  session,
  proposalId,
  status,
  now,
): Promise<void>;
```

Each handler owns its `logEvent` call. Top-level dispatcher = switch on `kind`. **Don't** make a generic "apply" — kinds genuinely diverge.

### `getGraphData` (~170L → ~40L outer + 2 leg helpers in `graph.ts`)

```ts
async function fetchGraphNodesAndEdges(
  session,
  userId,
  profileFilter,
): Promise<{ nodes; relatesToEdges; entities }>;
async function fetchTagSharedEdges(
  session,
  userId,
  profileFilter,
): Promise<TagEdge[]>;
```

Outer keeps the `Promise.all` over two sessions (parallelism contract stays explicit). Note Neo4j rule: **separate sessions** for parallel queries.

`listMemories` (~145L) and `deduplicateMemories` (~130L) — borderline. Don't decompose; readable as-is.

## Migration order (one extraction per checkpoint; user runs typecheck)

1. **`types.ts`** — pure type extraction. Old file imports back via `import type`.
2. **`mappers.ts`** — pure functions. Old file re-imports.
3. **`shared.ts`** — `withSession` + `logEvent` + new `profileFilter` + `visibleStatusClause`. Class's private methods become wrappers over the free versions.
4. **`migration.ts`** — single caller (`convex/neo4jActions/migration.ts`), backfill-only, lowest blast radius.
5. **`team.ts`** — separate access model, few callers.
6. **`enrichment.ts`** — single caller.
7. **`connectors.ts`** — single caller, single method (`upsertFromSource`).
8. **`events.ts` + `stats.ts` + `timeline.ts`** — small, read-only, independent.
9. **`chunks.ts` + `dedup.ts`** — clear boundaries within `memories.ts` caller.
10. **`relationships.ts` + `search.ts`** — clean caller mapping.
11. **`crud.ts`** — by now all deps are free.
12. **`graph.ts`** — apply `getGraphData` decomposition during extraction.
13. **`proposals.ts`** — apply `resolveProposal` decomposition during extraction.
14. **`retrieve.ts`** — apply `retrieveMemories` decomposition during extraction.
15. **`dreamMode.ts`** — depends on `proposals.ts`.
16. **Final cleanup** — collapse `memoryService.ts` to pure re-exports (~80 LOC), delete `MemoryService` class. 13 caller files keep their existing `import { … } from "./memoryService"` lines unchanged.

After each step: user runs `cd packages/backend && npx convex codegen --typecheck enable` per CLAUDE.md.

## What NOT to do

- **No** generic `QueryBuilder` DSL — clashes with `cypher-builder` already minimal and no-`any` rule.
- **No** pagination helper — `SKIP/LIMIT` is 3 tokens, helper would just shuffle string concat.
- **No** unifying `*ForTeam` methods with non-team counterparts — different ownership semantics; merging via flags = branchy soup.
- **No** splitting `mappers.ts` per module — cross-cutting use is the whole point.
- **No** `MemoryRepository` interface or DI port — Convex already injects `driver`, no consumer for the abstraction.
- **No** vector-search/semantic-edge/tag-merge helper extraction in this pass — defer until split exposes real variation.

## Critical files

- `C:\Vedant\Personal\GitHub\vmem\packages\backend\src\neo4j\memoryService.ts` — the source.
- `C:\Vedant\Personal\GitHub\vmem\packages\backend\src\neo4j\codebaseService.ts` — orchestrator precedent.
- `C:\Vedant\Personal\GitHub\vmem\packages\backend\src\neo4j\codebase\` — folder layout precedent.
- `C:\Vedant\Personal\GitHub\vmem\packages\backend\src\neo4j\cypherHelpers.ts` — keep focused (one helper today); don't grow into a builder lib.
- `C:\Vedant\Personal\GitHub\vmem\packages\backend\convex\memoryApi.ts` — caller (uses many service methods).
- `C:\Vedant\Personal\GitHub\vmem\packages\backend\convex\neo4jActions\*.ts` — 12 caller files; imports stay on `./memoryService` thanks to thin orchestrator.

## Verification

After each numbered step:

1. `cd packages/backend && npx convex codegen --typecheck enable` — no type errors.
2. Grep that all callers still resolve their imports: `grep -r "from \".*memoryService\"" apps/ packages/` — count unchanged.

After step 16 (final): 3. Open Convex dashboard, run a representative action from each cluster (a memory CRUD via web app, a search, a graph view, an approve-proposal, a dream-mode synthesis trigger if exposed). 4. User exercises web UI flows that touch each module — visual smoke (per project rule: never test with curl). 5. Run `/changelog` per CLAUDE.md — refactor of this size warrants an entry.

## Risks & open questions

- **`logEvent` cross-module use** — called from `crud`, `proposals`, `dreamMode`. Receives an active `Session`, so transaction semantics don't change across the split. Confirm during step 3.
- **`computeContentHash` is the only top-level export today** — re-export from the orchestrator so callers don't break.
- **Existing `unknown` / `as` usages** — current code uses `unknown` for Neo4j record values in places (forbidden by CLAUDE.md). Refactor preserves them verbatim — fixing is out of scope. Flag in PR description.
- **`VISIBLE_STATUSES = [...] as const`** — `as const` is allowed (it's not a type assertion, it's a const assertion). If linter disagrees, switch to `const VISIBLE_STATUSES: readonly MemoryStatus[] = ["active", "pinned"]`.
- **One PR vs many** — the 16-step migration order supports one big PR or 16 small ones. Default: one PR, since it's greenfield and 13 caller files keep their imports unchanged (orchestrator pattern).

### Unresolved questions

1. One PR or split into multiple? (default: one)
2. Should `unknown`/`as` cleanups inside the moved code happen in the same pass or a follow-up? (default: follow-up — refactor preserves behaviour)
