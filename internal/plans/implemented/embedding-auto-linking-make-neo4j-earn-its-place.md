# Embedding Auto-Linking: Make Neo4j Earn Its Place

## Context

vmem's Neo4j graph has weak edges — only structural connections (same domain, same session, same tags). No semantic understanding of how memories relate to each other. Mem0 and Supermemory both use LLM + embedding similarity to create meaningful connections. vmem already stores 1536-dim embeddings on Memory nodes and has a vector index (`memory_embedding`, cosine) — but only uses it for retrieval search, never for edge creation. This change makes new memories automatically link to semantically similar existing memories, turning the graph from a glorified document store into an actual knowledge graph.

## Plan

### 1. Semantic edge creation in `createMemory()` (~10 lines)

**File**: `packages/backend/src/neo4j/memoryService.ts`
**Where**: After line 377 (after same-domain edges), before line 379 (`const firstRecord`)

```typescript
// After same-domain edges, before return
if (params.embedding !== null) {
  await session.run(
    `CALL db.index.vector.queryNodes('memory_embedding', $k, $embedding)
     YIELD node AS candidate, score AS similarity
     WHERE candidate.userId = $userId
       AND candidate.id <> $id
       AND similarity >= $threshold
     WITH candidate, similarity ORDER BY similarity DESC LIMIT $limit
     MATCH (m:Memory {id: $id})
     MERGE (m)-[r:RELATES_TO]->(candidate)
     ON CREATE SET r.reason = 'semantic similarity', r.score = similarity`,
    {
      k: neo4j.int(20),
      embedding: params.embedding,
      userId: params.userId,
      id,
      threshold: 0.78,
      limit: neo4j.int(5),
    },
  );
}
```

- **k=20**: Over-fetch from vector index; threshold + userId filter narrow to ≤5
- **threshold=0.78**: text-embedding-3-small same-topic pairs ~0.78-0.90, cross-topic ~0.55-0.75
- **MERGE**: If pair already linked (same-domain etc), no duplicate edge. `ON CREATE SET` only fires on new edges
- **~10-20ms added latency**: HNSW index lookup is fast; negligible vs the 100-300ms embedding HTTP call upstream
- **Graceful degradation**: No embedding → no vector search → no edges

### 2. Thread `score` through graph API (type additions only)

Add `score?: number` to the RELATES_TO edge shape everywhere it's passed:

| File                                   | Change                                           |
| -------------------------------------- | ------------------------------------------------ |
| `memoryService.ts` line 1586           | Add `score: r.score` to `getGraphData` collect   |
| `memoryService.ts` line 1758           | Add `r.score AS score` to `getLocalGraph` return |
| `memoryService.ts` line 1778           | Add `score` to the mapping at line 1778-1782     |
| `convex/neo4jActions/graph.ts` line 33 | Add `score?: number` to type                     |
| `convex/graphApi.ts` lines 47, 68      | Add `score?: number` to both interfaces          |
| `apps/web/.../graph-data.ts`           | Add `score?: number` to `ApiRelatesToEdge`       |
| `apps/web/.../graph-types.ts`          | Add `score?: number` to edge types               |
| `apps/web/hooks/useGraphData.ts`       | Add `.score` to zod schema                       |

### 3. Show score in graph tooltip

**File**: `apps/web/src/components/_components/GraphEdgeTooltip.tsx`

When `reason === 'semantic similarity'` and `score` exists, show:

```
Related · semantic similarity (84%)
```

### 4. Backfill migration for existing memories

**Files**: `memoryService.ts` (3 new methods) + `convex/neo4jActions/migration.ts` (2 new actions)

**New memoryService methods:**

- `listMissingSemanticEdges(limit)` — finds memories with embeddings but `semanticEdgesAt IS NULL`
- `createSemanticEdgesForMemory(id, userId, embedding)` — runs the same vector search Cypher as step 1
- `markSemanticEdgesProcessed(ids)` — sets `m.semanticEdgesAt = datetime()`

**New migration actions (self-rescheduling, same pattern as `backfillEmbeddingsInternal`):**

- `backfillSemanticEdgesInternal` — fetches batch of 50, creates edges for each, marks processed, reschedules self
- `startSemanticEdgesBackfill` — kicks off the backfill (run from Convex dashboard)

### 5. Also add to `upsertFromSource()`

**File**: `memoryService.ts` line ~530

Same vector search block, gated on new memory creation (not update) + non-null embedding. Covers connector imports (Google Drive, Notion, etc).

## Files Modified

1. `packages/backend/src/neo4j/memoryService.ts` — core change + backfill helpers + score threading
2. `packages/backend/convex/neo4jActions/migration.ts` — backfill actions
3. `packages/backend/convex/neo4jActions/graph.ts` — score in edge type
4. `packages/backend/convex/graphApi.ts` — score in API types
5. `apps/web/src/components/_components/graph-data.ts` — score in frontend type
6. `apps/web/src/components/_components/graph-types.ts` — score in frontend type
7. `apps/web/src/hooks/useGraphData.ts` — score in zod schema
8. `apps/web/src/components/_components/GraphEdgeTooltip.tsx` — show score %

## What This Does NOT Change

- No new relationship type — uses existing `RELATES_TO` with `reason: 'semantic similarity'`
- No changes to `retrieveMemories()` — search and auto-linking are independent
- No changes to LLM enrichment (`applyEnrichment`) — `content similarity` edges coexist
- No changes to embedding generation flow — embedding already computed before `createMemory` is called

## Verification

1. Save a page via extension with OPENROUTER_API_KEY configured
2. Check Neo4j browser: `MATCH (m)-[r:RELATES_TO {reason: 'semantic similarity'}]->(n) RETURN m.title, r.score, n.title LIMIT 10`
3. Open graph view on web app — semantic edges should appear with score in tooltip
4. Run backfill from Convex dashboard, verify existing memories get semantic edges
5. Save a memory without API key — should still work, just no semantic edges
