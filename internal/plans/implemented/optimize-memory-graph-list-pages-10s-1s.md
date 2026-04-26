# Optimize memory graph + list pages (10s → <1s)

## Context

Test account has **12k memories**. Both pages take ~10s to load. Root causes are different:

- **List page**: `MemoryContext` (`apps/web/src/components/contexts/MemoryContext.tsx:123–149`) fetches every memory via a sequential 100-per-page loop → 120+ round trips before render. All filters (profile, source, type, tags, search) then run client-side in JS. Cypher itself is fine; the architecture is wrong.
- **Graph page**: `getGraphData` (`packages/backend/src/neo4j/memoryService.ts:1247–1378`) scans the whole user memory set (no `ORDER BY … LIMIT` in the MATCH, post-cap is done in JS via `capGraph`), and the tag-edges query does an O(n²) pair cartesian — the `userTagCount >= 2 AND <= 500` gate fires too late for dense tag usage.
- **Latent filter bugs**: profile/source filters never reach Cypher; `searchMemories` ignores type/status/tags/profile when a search query is present; search returns `total = page.length` (pagination UI lies).

Goal: list renders first page in <300ms, graph renders in <1s, search in <300ms — with filters round-tripping through the server.

## Plan

### 1. New composite index

`packages/backend/src/neo4j/setup.ts`

Add:

```cypher
CREATE INDEX memory_user_status_created IF NOT EXISTS
FOR (m:Memory) ON (m.userId, m.status, m.createdAt)
```

Covers the universal pattern: `WHERE userId = $u AND status IN ['active','pinned'] ORDER BY createdAt DESC`. One index seek + already-sorted output for both list and graph.

### 2. Rewrite `listMemories` in memoryService.ts (lines 414–495)

Merge `listMemories` and `searchMemories` into one service method. Signature:

```ts
async listMemories(params: {
  userId: string;
  profileId?: string | null;
  type?: MemoryType;
  status?: MemoryStatus;          // default 'active' | 'pinned'
  source?: string;                 // NEW — pushed down
  tags?: string[];
  searchQuery?: string;            // NEW — fulltext path
  limit: number;
  offset: number;
}): Promise<{ memories: MemoryWithTags[]; total: number }>
```

Single-round-trip Cypher using `CALL ()` scope subqueries (modern Cypher, each subquery independent — preserves `total` even when page is empty):

```cypher
// fulltext path (when searchQuery present)
CALL () {
  CALL db.index.fulltext.queryNodes('memory_content', $searchQuery) YIELD node AS m, score
  WHERE m.userId = $userId
    AND <profileFilter> AND <typeFilter> AND <statusFilter> AND <sourceFilter>
    AND <tagFilter via sub-MATCH count>
  RETURN count(m) AS total
}
CALL () {
  CALL db.index.fulltext.queryNodes('memory_content', $searchQuery) YIELD node AS m, score
  WHERE <same filters>
  WITH m, score ORDER BY score DESC SKIP $offset LIMIT $limit
  OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
  WITH m, collect(t.name) AS tags, score
  RETURN collect({m: m, tags: tags, score: score}) AS page
}
RETURN total, page
```

```cypher
// non-search path
CALL () {
  MATCH (m:Memory) WHERE <all filters>
  RETURN count(m) AS total
}
CALL () {
  MATCH (m:Memory) WHERE <all filters>
  WITH m ORDER BY m.createdAt DESC SKIP $offset LIMIT $limit
  OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
  WITH m, collect(t.name) AS tags
  RETURN collect({m: m, tags: tags}) AS page
}
RETURN total, page
```

- `<profileFilter>`: `(m.profileId = $profileId OR m.profileId IS NULL)` only when set
- `<sourceFilter>`: `m.source = $source` (fixes bug)
- `<tagFilter>`: reuse existing index-joined pattern (lines 465–469) — move it into both CALL branches
- Status defaults to `IN ['active','pinned']` via `coalesce(m.status, 'active')` if omitted (matches graph behaviour)
- Replaces `searchMemories` (614–653) and its team variant behaviour

Delete `searchMemories` from `memoryService.ts` and from `memoryApi.ts` / `neo4jActions/memories.ts`. Frontend converges on a single `listMemories` action.

### 3. Rewrite `getGraphData` (lines 1247–1378)

Two parallel sessions kept (CLAUDE.md rule: no parallel `.run()` on same session). Both queries tightened.

**Session 1 — nodes + RELATES_TO in one round trip, bounded to most recent 2000:**

```cypher
CALL () {
  MATCH (m:Memory {userId: $userId})
  WHERE coalesce(m.status, 'active') IN ['active', 'pinned'] <profileFilter>
  WITH m ORDER BY m.createdAt DESC LIMIT 2000
  OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
  WITH m, collect(t.name) AS tags
  RETURN collect({
    id: m.id, title: m.title, tags: tags, createdAt: m.createdAt,
    source: m.source, type: m.type, sourceType: m.sourceType
  }) AS nodes, collect(m.id) AS nodeIds
}
CALL (nodeIds) {
  MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
  WHERE a.id IN nodeIds AND b.id IN nodeIds
  RETURN collect({source: a.id, target: b.id, reason: r.reason}) AS relatesToEdges
}
RETURN nodes, relatesToEdges
```

Benefits: uses `memory_user_status_created` index, LIMIT pushed into MATCH (not JS `capGraph`), RELATES_TO is now scoped to the 2000 node IDs (O(edges_in_subgraph), not O(all user edges)), no duplicate `MATCH (a:Memory {userId})` scan.

**Session 2 — tag-edges, cartesian tightened:**

```cypher
MATCH (m:Memory {userId: $userId})-[:TAGGED_WITH]->(t:Tag)
WHERE coalesce(m.status, 'active') IN ['active', 'pinned'] <profileFilter>
WITH t, collect(m) AS memsForTag, count(*) AS userTagCount
WHERE userTagCount >= 2 AND userTagCount <= 500
UNWIND memsForTag AS m1
UNWIND memsForTag AS m2
WITH m1, m2, t WHERE m1.id < m2.id
WITH m1, m2, collect(DISTINCT t.name) AS sharedTagsAll
WITH m1, m2, sharedTagsAll, size(sharedTagsAll) AS weight
WHERE weight >= 2
RETURN m1.id AS source, m2.id AS target, weight, sharedTagsAll[..5] AS sharedTags
ORDER BY weight DESC
LIMIT 5000
```

Benefits: pair generation is bounded per tag to `memsForTag × memsForTag` (already capped at 500×500 by the cardinality gate), rather than the planner choosing a join order that scans Memory twice. Profile/status filter applied once in the seed MATCH, not 5×.

### 4. Rewrite `getLocalGraph` (lines 1401–1464) with QPP

Replace the variable-length OPTIONAL MATCH + UNWIND + DISTINCT with a Quantified Path Pattern:

```cypher
MATCH (focus:Memory {id: $focusId, userId: $userId})
WHERE coalesce(focus.status, 'active') IN ['active', 'pinned'] <focusProfile>
OPTIONAL MATCH (focus)
  ((a:Memory WHERE coalesce(a.status,'active') IN ['active','pinned'])
   -[:RELATES_TO]-
   (b:Memory WHERE coalesce(b.status,'active') IN ['active','pinned'] AND b.userId = $userId)){1,2}
  (neighbor:Memory)
WITH focus, collect(DISTINCT neighbor) AS ns
WITH [focus] + ns AS allNodes
UNWIND allNodes AS m
WITH DISTINCT m LIMIT 500
OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
RETURN m.id AS id, m.title AS title, collect(t.name) AS tags,
       m.createdAt AS createdAt, m.source AS source,
       m.type AS type, m.sourceType AS sourceType
```

Benefits: inline filtering during traversal stops expansion early at suppressed/wrong-user nodes. QPP is the idiomatic 2025 Cypher replacement for `[:REL*1..2]` with per-hop filtering (see neo4j-cypher-guide).

### 5. Update Convex actions

`packages/backend/convex/memoryApi.ts`

- `listMemories` action (137–163): extend validator with `profileId?`, `source?`, `searchQuery?`. Pass through to `listMemoriesInternal`.
- Delete `searchMemories` action (217–245) and its internal. Frontend search uses `listMemories({ searchQuery })`.

`packages/backend/convex/neo4jActions/memories.ts`

- Update `listMemoriesInternal` validator/handler to mirror. Delete `searchMemoriesInternal`.

### 6. Rewrite MemoryContext (client)

`apps/web/src/components/contexts/MemoryContext.tsx`

- **Delete** the fetch-all loop (123–149).
- Keep create/update/delete mutations and their optimistic updates.
- Expose a new hook `useMemoryListPage(filters)` using TanStack `useInfiniteQuery`:
  - `queryKey: ["memories", filters]`
  - `queryFn({ pageParam })`: calls `api.memoryApi.listMemories({ ...filters, offset: pageParam, limit: 100 })`
  - `getNextPageParam(last, all)`: `all.flatMap(p => p.memories).length < last.total ? all.flatMap().length : undefined`
- Mutations invalidate `["memories"]` root key — TanStack auto-invalidates all pages.

### 7. Rewrite MemorySearch (client)

`apps/web/src/components/MemorySearch.tsx`

- Replace `useMemoryContext().memories` with `useMemoryListPage({ profileId, type, status, source, tags, searchQuery })` driven by nuqs params.
- Remove the client-side filter chain for memory items (100–136). Kind filter stays (for wiki/skill merging).
- Wiki (`api.wiki.listTree`) and skills (`api.skills.listMy`) stay fully loaded — both are small and already single-query.
- Merge: memories (paginated, already filtered) + wiki + skills → pass to `Virtuoso`.
- `Virtuoso endReached={fetchNextPage}` triggers next page.
- Client-side search utility `searchListItems` (`@/lib/list-items`) still used for wiki/skills; memory search results already come back scored from Cypher.

### 8. Graph — no client changes needed

`apps/web/src/hooks/useGraphData.ts` already wraps a single action call + 30s staleTime cache. The Cypher rewrite alone fixes the 10s.

## Critical files

- `packages/backend/src/neo4j/setup.ts` — add composite index
- `packages/backend/src/neo4j/memoryService.ts` — rewrite `listMemories`, `getGraphData`, `getLocalGraph`, delete `searchMemories`
- `packages/backend/convex/memoryApi.ts` — extend `listMemories` validator, delete `searchMemories`
- `packages/backend/convex/neo4jActions/memories.ts` — mirror
- `apps/web/src/components/contexts/MemoryContext.tsx` — delete fetch-all loop, expose `useMemoryListPage`
- `apps/web/src/components/MemorySearch.tsx` — switch to paginated hook, remove JS filter chain
- `apps/web/src/routes/_main/memories/-searchParams.ts` — already has filter params (reused, no change)

## Reuse

- `nuqs` filter state already exists (`memoriesSearchParams`) — wire it into the new hook, no new state plumbing
- `Virtuoso` already used for rendering — `endReached` is native
- Existing fulltext index `memory_content` and composite indexes stay
- Existing `toMemoryWithTags` / `toTagEdge` decoders in `memoryService.ts` reused
- `withSession` wrapper pattern preserved for single-session queries

## Verification

1. **Index created**: on dev/prod Convex action for `dbSetup`, verify `SHOW INDEXES` in Neo4j includes `memory_user_status_created`.
2. **List page**: open `/memories?view=list` with 12k-memory test account. Network tab: one `listMemories` call returning 100 items in <300ms. Scroll to bottom → second page fetches in <300ms.
3. **List filters**: toggle each filter (profile/source/type/tag). Each change = one Cypher round trip, URL updates via nuqs, Virtuoso reshuffles.
4. **List search**: type in search box — debounced fulltext hit in <300ms. Verify tag + type + profile filters narrow search results (currently ignored — bug fix).
5. **Graph page**: `/memories?view=graph` renders in <1s. Verify most-recent 2000 memories are shown.
6. **Graph focus**: click a node → local graph renders in <500ms via QPP.
7. **Cypher PROFILE**: in Neo4j Browser, run `PROFILE <new listMemories cypher>` — confirm planner uses `NodeIndexSeek` on `memory_user_status_created`, not `NodeByLabelScan`.
8. **Types**: `cd packages/backend && npx convex codegen --typecheck enable` — no errors.
9. **Team path**: if `listMemoriesForTeam` / `searchMemoriesForTeam` are called anywhere in the app today, mirror the same rewrite to them. Otherwise defer as dead code.

## Unresolved questions

- None blocking. Team list variants (`listMemoriesForTeam` 1715–1781, `searchMemoriesForTeam` 1800–1837) likely need the same rewrite — confirm during impl whether team views are currently active in UI or can be deferred.
