# Migrate Hono API to Convex "use node" Actions

## Context

Hono API on Railway (`apps/api/`) handles all Neo4j operations (memories, dashboard, timeline, relationships, graph, codebases). Frontend and MCP server call it via REST/fetch with Bearer tokens. Goal: eliminate Railway for the API by moving Neo4j operations into Convex `"use node"` actions. MCP server stays on Railway but calls Convex HTTP actions instead.

## Key Decisions

1. **"use node" internalActions** do the Neo4j work. Public `authAction` wrappers (V8 runtime) handle Clerk auth and delegate via `ctx.runAction`. HTTP actions handle MCP Bearer auth and delegate to the same internalActions.
2. **Drop server-side caching** (graph 30s, codebases 60s). Client-side React Query staleTime provides equivalent UX. Module-level cache is unreliable across cold starts.
3. **Keep React Query on frontend**, replace `fetch(API_URL)` with `useAction(api.xxx)` wrapped in React Query. Delete `useAuthFetch` hook.
4. **Memory events become direct mutations** — `ctx.runMutation(internal.memoryEvents.pushEventInternal)` replaces the HTTP `ConvexHttpClient` push. Add `pushEventInternal` internalMutation (no secret check).
5. **Enrichment via `ctx.scheduler.runAfter(0, ...)`** — cleaner than fire-and-forget dangling promises.
6. **MCP HTTP routes**: 5 POST endpoints on Convex httpRouter. Each verifies MCP JWT in-action (single hop: httpAction → internalAction that verifies + queries Neo4j).

## Architecture

```
Frontend → authAction → getClerkIdInternal → ctx.runAction(internalAction "use node") → Neo4j
MCP      → httpAction → ctx.runAction(internalAction "use node" with token verify) → Neo4j
```

---

## File Structure

```
convex/
  neo4j/
    driver.ts              — Neo4j driver singleton (utility, no Convex function exports)
    memoryService.ts       — Port of apps/api/src/db/memory-service.ts (1330 lines)
    codebaseService.ts     — Port of apps/api/src/db/codebase-service.ts
    cypherHelpers.ts       — Port of apps/api/src/db/cypher-helpers.ts
    setup.ts               — Port of apps/api/src/db/setup.ts (constraints + indexes)
    url.ts                 — Port of apps/api/src/lib/url.ts
    importParser.ts        — Port of apps/api/src/utils/import-parser.ts
  neo4jActions/
    memories.ts            — "use node", internalActions: create/get/list/update/delete/search/retrieve/getEvents
    enrichment.ts          — "use node", internalAction: enrichMemory (OpenRouter call)
    dashboard.ts           — "use node", internalActions: getStats, getRecentActivity
    timeline.ts            — "use node", internalActions: getMemoryTimeline, getTopicTimeline, getSearchTimeline
    relationships.ts       — "use node", internalActions: link/unlink/getRelated/getAll
    graph.ts               — "use node", internalActions: getGraphData, getLocalGraph
    codebases.ts           — "use node", internalActions: syncCodebase, getCodebaseGraph, deleteCodebase
    proposedUpdates.ts     — "use node", internalActions: list, resolve
    mcpAuth.ts             — "use node", shared verifyMcpJwt helper (not a Convex function, just a utility imported by MCP-facing actions)
    dbSetup.ts             — "use node", internalAction: ensureNeo4jSetup (one-time)
  memoryApi.ts             — authAction wrappers: memory CRUD, search, retrieve, events
  dashboardApi.ts          — authAction wrappers: getStats, getRecentActivity
  timelineApi.ts           — authAction wrappers: memory/topic/search timeline
  relationshipApi.ts       — authAction wrappers: link/unlink/getRelated/getAll
  graphApi.ts              — authAction wrappers: getGraphData, getLocalGraph
  proposedUpdateApi.ts     — authAction wrappers: list, resolve
  http.ts                  — Extend with 5 MCP REST routes
  memoryEvents.ts          — Add pushEventInternal internalMutation
```

### Why This Split

- `neo4j/` = pure TS utilities (no `"use node"`, no Convex function exports). Imported by action files → runs in Node.js runtime of the importer.
- `neo4jActions/` = `"use node"` files that only export actions. They import from `neo4j/` and do the actual work.
- `memoryApi.ts` = no `"use node"`, exports authActions that delegate to internalActions via `ctx.runAction`.

---

## Phase 0: Dependencies

**`packages/backend/package.json`** — add:

- `neo4j-driver` ^5.27.0
- `@neo4j/cypher-builder` ^3.0.1
- `jsonwebtoken` (from catalog)
- `@types/jsonwebtoken` (from catalog, devDependency)

**Convex env vars** (via `npx convex env set`):

- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`
- `MCP_JWT_SECRET`
- `OPENROUTER_API_KEY`, `ENRICHMENT_MODEL`

---

## Phase 1: Port Service Layer → `convex/neo4j/`

Direct copies with import path updates. No behavioral changes.

| Source                                | Destination                       |
| ------------------------------------- | --------------------------------- |
| `apps/api/src/db/neo4j.ts`            | `convex/neo4j/driver.ts`          |
| `apps/api/src/db/memory-service.ts`   | `convex/neo4j/memoryService.ts`   |
| `apps/api/src/db/codebase-service.ts` | `convex/neo4j/codebaseService.ts` |
| `apps/api/src/db/cypher-helpers.ts`   | `convex/neo4j/cypherHelpers.ts`   |
| `apps/api/src/db/setup.ts`            | `convex/neo4j/setup.ts`           |
| `apps/api/src/lib/url.ts`             | `convex/neo4j/url.ts`             |
| `apps/api/src/utils/import-parser.ts` | `convex/neo4j/importParser.ts`    |

**Key change**: `driver.ts` removes the `ensureIndexes` function (moves to `dbSetup.ts`). `getDriver()` stays as a lazy singleton.

## Phase 2: Create Internal Actions → `convex/neo4jActions/`

Each file: `"use node"` at top, imports driver + service, exports `internalAction` functions.

**Pattern for each action:**

```ts
"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { MemoryService } from "../neo4j/memoryService";
import { getDriver } from "../neo4j/driver";

export const createMemoryInternal = internalAction({
  args: { clerkId: v.string(), title: v.string() /* ... */ },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    const result = await service.createMemory({
      userId: args.clerkId,
      ...args,
    });
    // Push memory event via direct mutation
    await ctx.runMutation(internal.memoryEvents.pushEventInternal, {
      clerkId: args.clerkId,
      eventType: "memory_created",
      memoryId: result.id,
      payload: JSON.stringify({ title: result.title }),
    });
    // Schedule enrichment
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.enrichment.enrichMemory,
      {
        memoryId: result.id,
        userId: args.clerkId,
        title: result.title,
        content: result.content,
      },
    );
    return result;
  },
});
```

**Actions to create:**

| File                 | Actions                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `memories.ts`        | createMemoryInternal, getMemoryInternal, listMemoriesInternal, updateMemoryInternal, deleteMemoryInternal, searchMemoriesInternal, retrieveMemoriesInternal, getMemoryEventsInternal |
| `enrichment.ts`      | enrichMemory (port of `services/memory-enrichment.ts`)                                                                                                                               |
| `dashboard.ts`       | getStatsInternal, getRecentActivityInternal                                                                                                                                          |
| `timeline.ts`        | getMemoryTimelineInternal, getTopicTimelineInternal, getSearchTimelineInternal                                                                                                       |
| `relationships.ts`   | linkMemoriesInternal, unlinkMemoriesInternal, getRelatedMemoriesInternal, getAllRelationshipsInternal                                                                                |
| `graph.ts`           | getGraphDataInternal, getLocalGraphInternal                                                                                                                                          |
| `codebases.ts`       | syncCodebaseInternal, getCodebaseGraphInternal, deleteCodebaseInternal                                                                                                               |
| `proposedUpdates.ts` | listProposedUpdatesInternal, resolveProposalInternal                                                                                                                                 |
| `dbSetup.ts`         | ensureNeo4jSetup                                                                                                                                                                     |

**Also update `memoryEvents.ts`:** Add `pushEventInternal` internalMutation (same as `pushEvent` but without secret check).

## Phase 3: Public API Layer → Split by Domain

Each file: authAction wrappers that resolve Clerk ID then delegate to internalActions.

**Pattern for each action:**

1. Resolves Clerk ID: `ctx.runQuery(internal.auth.getClerkIdInternal, { userId: ctx.userId })`
2. Delegates: `ctx.runAction(internal.neo4jActions.memories.xxxInternal, { clerkId, ...args })`

| File                   | Exports                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `memoryApi.ts`         | createMemory, getMemory, listMemories, updateMemory, deleteMemory, searchMemories, retrieveMemories, getMemoryEvents |
| `dashboardApi.ts`      | getStats, getRecentActivity                                                                                          |
| `timelineApi.ts`       | getMemoryTimeline, getTopicTimeline, getSearchTimeline                                                               |
| `relationshipApi.ts`   | linkMemories, unlinkMemories, getRelatedMemories, getAllRelationships                                                |
| `graphApi.ts`          | getGraphData, getLocalGraph                                                                                          |
| `proposedUpdateApi.ts` | listProposedUpdates, resolveProposal                                                                                 |

**Update `convex/codebases.ts`:** Rewrite `syncCodebase` to call `internal.neo4jActions.codebases.syncCodebaseInternal` directly instead of `fetch(apiUrl + "/v1/codebases/sync")`. Remove `API_URL` and `INTERNAL_API_SECRET` env vars.

## Phase 4: MCP HTTP Routes → `convex/http.ts`

Add 5 POST routes for MCP. Each httpAction: extract Bearer token → call internalAction that verifies JWT + queries Neo4j in one hop.

```
POST /api/mcp/memories/search     → searchMemoriesInternal (with token verify)
POST /api/mcp/memories/retrieve   → retrieveMemoriesInternal (with token verify)
POST /api/mcp/memories/create     → createMemoryInternal (with token verify)
POST /api/mcp/memories/update     → updateMemoryInternal (with token verify)
POST /api/mcp/memories/delete     → deleteMemoryInternal (with token verify)
```

**MCP JWT verify:** Create `convex/neo4j/mcpAuth.ts` (utility, not a Convex function) that exports `verifyMcpJwt(token): string | null`. Imported by MCP-facing internalActions.

**Alternative for MCP (simpler):** Add a single `verifyAndRun` pattern — each internalAction optionally accepts `mcpToken` instead of `clerkId`. If `mcpToken` is provided, verify it and extract clerkId. This avoids duplicate actions.

## Phase 5: Update MCP `api-client.ts`

**File:** `apps/mcp/src/api-client.ts`

Change base URL from Hono to Convex site URL. Update paths:

- `/v1/memories/search` → `/api/mcp/memories/search`
- `/v1/memories/retrieve` → `/api/mcp/memories/retrieve`
- `/v1/memories` (POST) → `/api/mcp/memories/create`
- `/v1/memories/:id` (PATCH) → `/api/mcp/memories/update` (id in body)
- `/v1/memories/:id` (DELETE) → `/api/mcp/memories/delete` (id in body)

## Phase 6: Migrate Frontend Hooks

Replace `fetch(API_URL + ...)` / `useAuthFetch` with `useAction(api.memoryApi.xxx)`.

| Hook/Component            | Current Call                           | New Call                                                  |
| ------------------------- | -------------------------------------- | --------------------------------------------------------- |
| `MemoryContext.tsx`       | `authFetch(/v1/memories)`              | `useAction(api.memoryApi.listMemories)`                   |
| `MemoryContext.tsx`       | POST/PATCH/DELETE                      | `useAction(api.memoryApi.create/update/deleteMemory)`     |
| `useGraphData.ts`         | `fetch(/v1/graph)`                     | `useAction(api.graphApi.getGraphData)`                    |
| `useCodebaseGraphData.ts` | `fetch(/v1/codebases/:id/graph)`       | `useAction(api.codebaseApi.getCodebaseGraph)`             |
| `useTrailData.ts`         | `authFetch(/v1/timeline/topic)`        | `useAction(api.timelineApi.getTopicTimeline)`             |
| `useTimelineEvents.ts`    | `authFetch(/v1/timeline/*)`            | `useAction(api.timelineApi.getXxxTimeline)`               |
| `Dashboard.tsx`           | `fetch(/v1/dashboard/stats\|activity)` | `useAction(api.dashboardApi.getStats\|getRecentActivity)` |
| `SidebarFooter.tsx`       | `fetch(/v1/dashboard/stats)`           | `useAction(api.dashboardApi.getStats)`                    |
| `LinkMemoryModal.tsx`     | `fetch(/v1/relationships/link)`        | `useAction(api.relationshipApi.linkMemories)`             |
| `MemoryGraph.tsx`         | `fetch(/v1/relationships/link)`        | `useAction(api.relationshipApi.linkMemories)`             |

**Keep React Query wrappers** for staleTime/invalidation. Pattern:

```ts
const action = useAction(api.memoryApi.getGraphData);
const { data } = useQuery({
  queryKey: ["graph", focus],
  queryFn: () => action({ focus }),
  staleTime: 30_000,
});
```

**Delete:** `hooks/useAuthFetch.ts`, `NEXT_PUBLIC_API_URL` from `env/client.ts`

## Phase 7: Cleanup

- Delete `apps/api/` directory
- Remove `@vmem/api` from workspace
- Remove Railway API deployment
- Remove env vars: `API_URL`, `INTERNAL_API_SECRET`, `CONVEX_EVENT_SECRET`, `CONVEX_URL` from Convex
- Remove `NEXT_PUBLIC_API_URL` from frontend deployment
- Update CLAUDE.md

---

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — no errors
2. Run `npx convex run neo4jActions/dbSetup:ensureNeo4jSetup` — creates Neo4j constraints/indexes
3. Frontend: create memory → verify in Neo4j, check enrichment scheduled, check memoryEvent pushed
4. Frontend: list/search/retrieve memories → verify data matches
5. Frontend: graph page loads → verify nodes/edges render
6. Frontend: dashboard stats → verify counts
7. Frontend: codebases sync → verify files/edges in Neo4j
8. MCP: call each of the 5 endpoints via MCP client → verify responses

## Files Modified (Summary)

| File                                  | Action                                          |
| ------------------------------------- | ----------------------------------------------- |
| `packages/backend/package.json`       | Add neo4j-driver, cypher-builder, jsonwebtoken  |
| `convex/neo4j/*.ts` (7 files)         | **NEW** — ported service layer                  |
| `convex/neo4jActions/*.ts` (10 files) | **NEW** — "use node" internalActions            |
| `convex/*Api.ts` (6 files)            | **NEW** — authAction wrappers split by domain   |
| `convex/http.ts`                      | Extend with 5 MCP routes                        |
| `convex/memoryEvents.ts`              | Add pushEventInternal                           |
| `convex/codebases.ts`                 | Remove Hono fetch, call internalAction directly |
| `apps/web/hooks/*.ts` (5 files)       | Replace fetch with useAction                    |
| `apps/web/components/*.tsx` (4 files) | Replace fetch with useAction                    |
| `apps/web/env/client.ts`              | Remove NEXT_PUBLIC_API_URL                      |
| `apps/web/hooks/useAuthFetch.ts`      | **DELETE**                                      |
| `apps/mcp/src/api-client.ts`          | Update base URL + paths                         |
| `apps/api/`                           | **DELETE** (entire directory)                   |
| `CLAUDE.md`                           | Update architecture section                     |
