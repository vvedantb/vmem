# Memory Vector Search Implementation Plan

## Context

vmem currently uses fulltext search + recency + confidence scoring for memory retrieval. This misses semantic similarity — "my dog" won't match "my golden retriever". Adding vector search enables semantic matching, bringing us closer to Membase-level retrieval quality.

**Current state:**

- Neo4j driver v5.28.3 (vector-capable)
- Fulltext index on `[title, content]`
- Scoring: fulltext (50%) + recency (25%) + confidence (25%) via weighted average
- No embeddings

**User decisions:**

- Provider: OpenRouter (`openai/text-embedding-3-small`, 1536 dims)
- Migration: Backfill all existing memories
- Fusion: Reciprocal Rank Fusion (RRF)

---

## Implementation Steps

### Step 1: Create Embedding Service

**New file:** `packages/backend/src/neo4j/embeddingService.ts`

```ts
// generateEmbedding(text: string): Promise<number[]>
// generateEmbeddings(texts: string[]): Promise<number[][]>
// - POST https://openrouter.ai/api/v1/embeddings
// - Model: openai/text-embedding-3-small
// - Headers: Authorization: Bearer $OPENROUTER_API_KEY
// - Combine title + content as input
// - Batch up to 20 texts per request
// - Retry with exponential backoff on rate limit
```

Pattern reference: `internal/plans/todo/document-vector-search-v2.md` (Step 6.3)

---

### Step 2: Add Vector Index to Neo4j

**Modify:** `packages/backend/src/neo4j/setup.ts`

Add after fulltext index:

```cypher
CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
FOR (m:Memory) ON (m.embedding)
OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}}
```

---

### Step 3: Update Memory Node Interface

**Modify:** `packages/backend/src/neo4j/memoryService.ts`

```ts
interface MemoryNode {
  // ... existing fields
  embedding: number[] | null; // NEW
}

interface ScoreBreakdown {
  fulltext: number;
  recency: number;
  confidence: number;
  vector: number; // NEW
}
```

---

### Step 4: Embed on Memory Creation

**Modify:** `packages/backend/src/neo4j/memoryService.ts` → `createMemory()`

Before Neo4j CREATE:

1. Call `generateEmbedding(title + "\n\n" + content)`
2. Wrap in try/catch — on failure, log warning, set `embedding: null`
3. Add `embedding` to CREATE statement

**Modify:** `packages/backend/convex/neo4jActions/mcp.ts` → `mcpCreateMemory`

Pass embedding generation through service layer (service handles embedding internally).

---

### Step 5: Hybrid Retrieval with RRF

**Modify:** `packages/backend/src/neo4j/memoryService.ts` → `retrieveMemories()`

Replace current implementation:

```ts
async retrieveMemories(params) {
  // 1. Generate query embedding
  const queryEmbedding = await generateEmbedding(params.query);

  // 2. Run parallel searches
  const [fulltextResults, vectorResults] = await Promise.all([
    this.fulltextSearch(params),
    this.vectorSearch(params.userId, queryEmbedding, params.limit * 2),
  ]);

  // 3. RRF fusion
  const fused = rrfFuse(fulltextResults, vectorResults, { k: 60 });

  // 4. Apply recency + confidence weighting
  // 5. Build trace with reasons
}
```

**RRF formula:**

```ts
function rrfScore(rank: number, k = 60): number {
  return 1 / (k + rank);
}
// Combined: rrfScore(fulltextRank) + rrfScore(vectorRank)
```

**Vector search Cypher:**

```cypher
CALL db.index.vector.queryNodes('memory_embedding', $limit, $queryVector)
YIELD node, score
WHERE node.userId = $userId AND node.embedding IS NOT NULL
RETURN node.id AS id, score AS vectorScore
```

**Trace reasoning updates:**

- "strong semantic match" (vectorScore > 0.7)
- "matched both keywords and meaning" (fulltext > 0.5 AND vector > 0.5)
- "semantic search unavailable" (embedding IS NULL)

---

### Step 6: Backfill Migration

**New file:** `packages/backend/convex/neo4jActions/migration.ts`

```ts
export const backfillEmbeddingsInternal = internalAction({
  args: {
    batchSize: v.optional(v.number()), // default 50
    cursor: v.optional(v.string()), // last processed memory ID
  },
  handler: async (ctx, args) => {
    // 1. Query memories with embedding IS NULL, ordered by createdAt
    // 2. Generate embeddings in batch (20 at a time to OpenRouter)
    // 3. Update Neo4j nodes
    // 4. Schedule next batch if more remain
  },
});

export const startMigration = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillEmbeddingsInternal,
      {},
    );
  },
});
```

**Migration query:**

```cypher
MATCH (m:Memory)
WHERE m.embedding IS NULL
RETURN m.id, m.userId, m.title, m.content
ORDER BY m.createdAt DESC
LIMIT $batchSize
```

---

### Step 7: Environment Setup

Add to Convex:

```bash
npx convex env set OPENROUTER_API_KEY sk-or-v1-...
```

---

## File Summary

| File                                                | Action  | Description                                       |
| --------------------------------------------------- | ------- | ------------------------------------------------- |
| `packages/backend/src/neo4j/embeddingService.ts`    | **NEW** | OpenRouter embedding generation                   |
| `packages/backend/src/neo4j/setup.ts`               | MODIFY  | Add vector index                                  |
| `packages/backend/src/neo4j/memoryService.ts`       | MODIFY  | Add embedding to create, hybrid retrieve with RRF |
| `packages/backend/convex/neo4jActions/migration.ts` | **NEW** | Backfill embeddings action                        |

---

## Implementation Order

1. `embeddingService.ts` — standalone, no deps
2. `setup.ts` — add vector index
3. `memoryService.ts` interfaces — add `embedding` field
4. `memoryService.ts` createMemory — embed on create
5. `memoryService.ts` retrieveMemories — hybrid search + RRF
6. `migration.ts` — backfill action
7. Set `OPENROUTER_API_KEY` env var
8. Run migration
9. Test

---

## Verification

1. **Type check:** `cd packages/backend && npx convex codegen --typecheck enable`
2. **Create memory:** Verify embedding stored in Neo4j Browser:
   ```cypher
   MATCH (m:Memory {id: $id}) RETURN m.embedding IS NOT NULL
   ```
3. **Semantic search:** Create "I love my golden retriever" memory, query "my dog" — should match
4. **Trace:** Response should show `vector` in scoreBreakdown, "strong semantic match" in reason
5. **Migration:** Before/after counts:
   ```cypher
   MATCH (m:Memory) WHERE m.embedding IS NULL RETURN count(m)
   ```

---

## Critical Files

- `packages/backend/src/neo4j/memoryService.ts` — main service (lines 628-692 for retrieveMemories)
- `packages/backend/src/neo4j/setup.ts` — index setup
- `packages/backend/convex/neo4jActions/mcp.ts` — memory creation entry (line 82)
- `internal/plans/todo/document-vector-search-v2.md` — OpenRouter embedding pattern reference
