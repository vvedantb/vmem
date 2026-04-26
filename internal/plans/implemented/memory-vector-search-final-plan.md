# Memory Vector Search — Final Plan

## Context

vmem retrieval = fulltext(0.5) + recency(0.25) + confidence(0.25). No semantics ⇒ "my dog" ≠ "my golden retriever". Adding OpenRouter embeddings + hybrid search w/ RRF closes that gap.

Confirmed current state (reread):

- `MemoryNode` (memoryService.ts:14-27) — no `embedding`
- `ScoreBreakdown` (memoryService.ts:59-63) — 3 fields
- `createMemory` (memoryService.ts:210-305) — plain CREATE, no embed
- `upsertFromSource` (memoryService.ts:335-393) — plain MERGE, no embed (external connectors)
- `retrieveMemories` (memoryService.ts:655-727) — fulltext-only, weighted scoring
- `setup.ts` — has fulltext index `memory_content`; no vector index
- `packages/backend/convex/lib/envVars.ts` — `requireUserEnvVar(ctx, Id<"users">, key)` exists, plumbed, **unused**; Settings UI at `apps/web/src/routes/_main/settings/env-vars.tsx` lets users set `OPENROUTER_API_KEY`
- `apps/web` — no existing trace UI; `useLocalChat.ts:122` calls `retrieveMemories`; chat ignores `trace` in result
- No existing OpenRouter client anywhere in repo
- Node native fetch available; no new deps
- No test infra

Prior "plan" at `internal/plans/implemented/memory-vector-search-implementation-plan.md` — misfiled, actual code untouched.

User decisions:

- Provider: OpenRouter `openai/text-embedding-3-small` (1536 dims)
- Fusion: RRF k=60
- No SDK — raw fetch
- Key: **user-level** via `requireUserEnvVar`
- Embed on `upsertFromSource` too
- Include web UI trace update

---

## Design

### Layering

- `embeddingService.ts` — **pure**, takes `apiKey` param. No env var access, no ctx. POST to OpenRouter, Zod-validate, return `number[]` / `number[][]`.
- Convex action layer — resolves user key via `requireUserEnvVar`, generates embedding, passes vector to `MemoryService`.
- `MemoryService` — receives pre-computed `embedding` param on write; receives `queryEmbedding` param on read. Service stays pure Neo4j, no HTTP.

### Graceful degradation

- **Create path** (user has no key set or OpenRouter fails): embed = `null`, log warning, memory still created. Backfill can fix later.
- **Retrieve path** (no key): skip vector branch, fall back to fulltext-only scoring (current behaviour). Reason string: `"semantic search unavailable — set OPENROUTER_API_KEY"`.
- **Long content**: truncate input to 6000 chars before embedding (text-embedding-3-small max ~8191 tokens; 6000 chars ≈ safe).

### RRF fusion

```ts
// rank is 1-indexed
function rrfScore(rank: number, k = 60): number {
  return 1 / (k + rank);
}
// combined = rrfScore(ftRank) + rrfScore(vecRank)
// missing-side rank contributes 0
```

Final score = `rrfCombined * 0.5 + recency * 0.25 + confidence * 0.25` (keep existing weights; RRF replaces `fulltextScore` only).

### Clerk → Convex userId

`requireUserEnvVar` wants `Id<"users">`; actions have `clerkId`. Add:

```ts
// packages/backend/convex/lib/envVars.ts
export async function requireUserEnvVarByClerkId(
  ctx: ActionCtx,
  clerkId: string,
  key: string,
): Promise<string> {
  const userId = await ctx.runQuery(internal.users.getIdByClerkIdInternal, {
    clerkId,
  });
  if (!userId) throw new Error(`No user for clerkId ${clerkId}`);
  return requireUserEnvVar(ctx, userId, key);
}

// optional softer variant for embed-on-create fallback
export async function tryUserEnvVarByClerkId(
  ctx: ActionCtx,
  clerkId: string,
  key: string,
): Promise<string | null> {
  /* returns null instead of throwing */
}
```

Add `getIdByClerkIdInternal` in `users.ts` if not present (mirrors existing `by_clerk_id` index pattern — users.ts:13,31,57).

---

## Files

| File                                                          | Action         | Why                                                                                                    |
| ------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/backend/src/neo4j/embeddingService.ts`              | **NEW**        | Pure OpenRouter fetch, batched                                                                         |
| `packages/backend/src/neo4j/setup.ts`                         | MODIFY         | Add vector index `memory_embedding`                                                                    |
| `packages/backend/src/neo4j/memoryService.ts`                 | MODIFY         | `embedding` field; accept `embedding` on create/upsert; accept `queryEmbedding` on retrieve; RRF       |
| `packages/backend/convex/lib/envVars.ts`                      | MODIFY         | Add `requireUserEnvVarByClerkId` + soft variant                                                        |
| `packages/backend/convex/users.ts`                            | MODIFY (maybe) | Add `getIdByClerkIdInternal` if missing                                                                |
| `packages/backend/convex/neo4jActions/memories.ts`            | MODIFY         | `createMemoryInternal` + `retrieveMemoriesInternal` pull key, embed, pass vectors to service           |
| `packages/backend/convex/neo4jActions/connectorSync.ts`       | MODIFY         | Both `upsertFromSource` call sites (lines 78, 266) pass embedding                                      |
| `packages/backend/convex/neo4jActions/migration.ts`           | **NEW**        | Batch backfill, per-user key, self-scheduling cursor                                                   |
| `apps/web/src/hooks/useLocalChat.ts`                          | MODIFY         | Pass `trace` through to UI message metadata                                                            |
| `apps/web/src/components/.../MemoryRef*` (locate during impl) | MODIFY         | Render `trace.scoreBreakdown` incl. `vector` + reason, as tooltip/popover on memory references in chat |
| `apps/chrome-extension/src/types/api.ts`                      | MODIFY         | Add `vector: number` to `ScoreBreakdown` mirror type                                                   |

---

## Step-by-step

### 1. `embeddingService.ts` (new)

```ts
import { z } from "zod"; // already in deps
const EMB_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
const EMB_MODEL = "openai/text-embedding-3-small";
const MAX_INPUT_CHARS = 6000;
const BATCH_SIZE = 20;

const EmbeddingResp = z.object({
  data: z.array(
    z.object({ embedding: z.array(z.number()), index: z.number() }),
  ),
});

function truncate(t: string): string {
  return t.length > MAX_INPUT_CHARS ? t.slice(0, MAX_INPUT_CHARS) : t;
}

export async function generateEmbedding(
  apiKey: string,
  text: string,
): Promise<number[]> {
  const [v] = await generateEmbeddings(apiKey, [text]);
  if (!v) throw new Error("no embedding returned");
  return v;
}

export async function generateEmbeddings(
  apiKey: string,
  texts: string[],
): Promise<number[][]> {
  const out: number[][] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE).map(truncate);
    const body = await postWithRetry(apiKey, slice);
    for (const item of body.data) out[i + item.index] = item.embedding;
  }
  return out;
}

async function postWithRetry(
  apiKey: string,
  input: string[],
  attempt = 0,
): Promise<z.infer<typeof EmbeddingResp>> {
  const res = await fetch(EMB_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMB_MODEL, input }),
  });
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    return postWithRetry(apiKey, input, attempt + 1);
  }
  if (!res.ok)
    throw new Error(`OpenRouter embedding ${res.status}: ${await res.text()}`);
  return EmbeddingResp.parse(await res.json());
}
```

No `any`/`unknown`/`as`/`!`. Types inferred.

### 2. `setup.ts` — add after fulltext index (line 33)

```ts
await session.run(
  `CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
   FOR (m:Memory) ON (m.embedding)
   OPTIONS {indexConfig: {\`vector.dimensions\`: 1536, \`vector.similarity_function\`: 'cosine'}}`,
);
```

### 3. `memoryService.ts` interface delta

```ts
interface MemoryNode {
  /* ...existing... */
  embedding: number[] | null; // NEW — optional, nullable to support graceful degradation + backfill
}

interface ScoreBreakdown {
  fulltext: number;
  vector: number; // NEW
  recency: number;
  confidence: number;
}
```

Update `toMemoryWithTags` helper to hydrate embedding from Neo4j (or keep excluded — embedding is huge, don't return to clients; only needed internally during retrieve Cypher).

**Decision**: `MemoryNode` type keeps `embedding` for schema clarity, but `toMemoryWithTags` **omits** it from returned objects (avoid shipping 1536 floats over network). Retrieval Cypher never returns raw vectors to JS.

### 4. `createMemory` — accept `embedding` param

Add to params:

```ts
embedding: number[] | null;
```

Thread into CREATE Cypher:

```cypher
CREATE (m:Memory { ..., embedding: $embedding })
```

Same for `upsertFromSource`:

- `ON CREATE SET ... m.embedding = $embedding`
- `ON MATCH SET ... m.embedding = $embedding` (re-embed when content changes)

### 5. `retrieveMemories` — accept `queryEmbedding`, run hybrid, RRF

New signature:

```ts
async retrieveMemories(params: {
  userId: string;
  profileId?: string | null;
  query: string;
  queryEmbedding: number[] | null;  // null ⇒ fulltext-only
  type?: MemoryType;
  tags?: string[];
  limit: number;
}): Promise<MemoryCandidate[]>
```

Body:

1. Run fulltext Cypher (current query, return `id, fulltextScore, tags, ageInDays, confidence`) — over-fetch `limit * 2`.
2. If `queryEmbedding != null`, run vector Cypher in parallel (same session is single-threaded; use separate session or sequential awaits — **sequential is fine, Neo4j vector index is fast**; separate sessions cost pool slots):

   ```cypher
   CALL db.index.vector.queryNodes('memory_embedding', $k, $queryVector)
   YIELD node AS m, score AS vectorScore
   WHERE m.userId = $userId ${profileFilter}
   RETURN m.id AS id, vectorScore
   ```

   `$k = limit * 2`.

3. In JS: build rank maps from each list. Union IDs. For each id: `rrf = rrfScore(ftRank?) + rrfScore(vecRank?)` (0 if missing).
4. Re-fetch full memories for merged IDs (single Cypher: `MATCH (m:Memory) WHERE m.id IN $ids OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t) RETURN m, collect(t.name) AS tags, duration.between(...).days AS ageInDays`).
5. Compute recency (existing buckets), confidence, total = `rrf*0.5 + recency*0.25 + confidence*0.25`.
6. Sort by total, take `limit`.
7. Build trace: reasons = existing + `"strong semantic match"` if vec>0.7, `"matched keywords and meaning"` if ft>0.5 && vec>0.5, `"semantic search unavailable"` if queryEmbedding null.
8. `scoreBreakdown` includes all 4 fields.

Note: Neo4j driver warns against parallel `session.run` on same session (per CLAUDE.md). Use `withSession` wrapper twice OR run sequentially. **Sequential**: cheaper, simpler, Neo4j vector query is ms-scale.

### 6. `memories.ts` action wiring

```ts
export const createMemoryInternal = internalAction({
  args: {
    /* unchanged */
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    // ...existing profile resolve, URL dedup...

    // NEW: try embedding (soft)
    let embedding: number[] | null = null;
    try {
      const apiKey = await tryUserEnvVarByClerkId(
        ctx,
        args.clerkId,
        "OPENROUTER_API_KEY",
      );
      if (apiKey) {
        embedding = await generateEmbedding(
          apiKey,
          `${args.title}\n\n${args.content}`,
        );
      }
    } catch (e) {
      console.warn("embedding failed on create", e);
    }

    const result = await service.createMemory({ ...existing, embedding });
    // ...existing event push...
  },
});

export const retrieveMemoriesInternal = internalAction({
  args: {
    /* unchanged */
  },
  handler: async (ctx, args) => {
    const service = new MemoryService(getDriver());
    let queryEmbedding: number[] | null = null;
    try {
      const apiKey = await tryUserEnvVarByClerkId(
        ctx,
        args.clerkId,
        "OPENROUTER_API_KEY",
      );
      if (apiKey) queryEmbedding = await generateEmbedding(apiKey, args.query);
    } catch (e) {
      console.warn("query embedding failed, falling back to fulltext", e);
    }
    return await service.retrieveMemories({ /* existing */ queryEmbedding });
  },
});
```

### 7. `connectorSync.ts` — embed on upsert

Before each `service.upsertFromSource(...)` call (lines 78, 266), generate embedding with same try/catch pattern. Pass as new `embedding` param. Pull key once per sync run, reuse for all files in that sync. Batch embeddings via `generateEmbeddings` for multi-file efficiency.

### 8. `migration.ts` (new)

```ts
"use node";
export const backfillEmbeddingsInternal = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const BATCH = args.batchSize ?? 50;
    const service = new MemoryService(getDriver());

    // fetch next batch across all users (grouped by userId)
    const rows = await service.listMissingEmbeddings(BATCH);
    if (rows.length === 0) {
      console.log("backfill done");
      return { done: true };
    }

    // group by userId (clerkId stored in node)
    const byUser = new Map<string, Array<{ id: string; text: string }>>();
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? [];
      list.push({ id: r.id, text: `${r.title}\n\n${r.content}` });
      byUser.set(r.userId, list);
    }

    for (const [clerkId, items] of byUser) {
      const apiKey = await tryUserEnvVarByClerkId(
        ctx,
        clerkId,
        "OPENROUTER_API_KEY",
      );
      if (!apiKey) {
        console.warn(`skip user ${clerkId}: no OPENROUTER_API_KEY`);
        continue;
      }
      const vectors = await generateEmbeddings(
        apiKey,
        items.map((x) => x.text),
      );
      await service.setEmbeddings(
        items.map((x, i) => ({ id: x.id, embedding: vectors[i] })),
      );
    }

    // reschedule until drained
    await ctx.scheduler.runAfter(
      0,
      internal.neo4jActions.migration.backfillEmbeddingsInternal,
      { batchSize: BATCH },
    );
    return { done: false, processed: rows.length };
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

New MemoryService methods:

- `listMissingEmbeddings(limit): Promise<Array<{id, userId, title, content}>>` — Cypher: `MATCH (m:Memory) WHERE m.embedding IS NULL RETURN m.id, m.userId, m.title, m.content LIMIT $limit`
- `setEmbeddings(rows): Promise<void>` — single `UNWIND $rows AS r MATCH (m:Memory {id: r.id}) SET m.embedding = r.embedding`

Run via Convex dashboard → Functions → run `internal.neo4jActions.migration.startMigration` once.

### 9. Web UI trace surfacing

- `useLocalChat.ts:207,212` — when mapping `retrieved.memories` to `memoryRefs`, attach `trace` (full `{score, scoreBreakdown, reason}`) to each ref.
- Locate memory reference render component (grep `memoryRefs\|MemoryRef` in `apps/web/src/components/chat`). Add a Popover (shadcn; already used per design system) on hover showing:
  - Total score (rounded 2dp)
  - Four-row breakdown: fulltext / vector / recency / confidence (bars or numeric)
  - Reason string
- Follow design system: no shadow on inline trigger, popover gets shadow (it's overlay).

### 10. Chrome extension type mirror

`apps/chrome-extension/src/types/api.ts` — add `vector: number` to `ScoreBreakdown`. No logic change needed; UI there doesn't render trace.

---

## Implementation order

1. `embeddingService.ts`
2. `setup.ts` — vector index
3. `memoryService.ts` — interfaces + `createMemory` + `upsertFromSource` + `listMissingEmbeddings` + `setEmbeddings`
4. `envVars.ts` helpers + `users.ts` lookup
5. `memoryService.ts` — `retrieveMemories` hybrid + RRF
6. `neo4jActions/memories.ts` wiring
7. `neo4jActions/connectorSync.ts` wiring
8. `neo4jActions/migration.ts`
9. `apps/chrome-extension/src/types/api.ts` type add
10. `apps/web` — pass trace through + popover
11. User sets their own `OPENROUTER_API_KEY` in Settings → Env Vars
12. Run `startMigration` once via Convex dashboard
13. Verify
14. Run `/changelog` — document what changed
15. Run `/ship` — stage relevant files, commit (conventional: `feat:`), push

---

## Verification

1. **Typecheck:** `cd packages/backend && npx convex codegen --typecheck enable` — no errors.
2. **Index created:** restart dev, Neo4j browser `SHOW INDEXES` includes `memory_embedding`.
3. **Create with key:** in Settings, set `OPENROUTER_API_KEY`. Create memory "I love my golden retriever." Neo4j browser:
   ```cypher
   MATCH (m:Memory) WHERE m.title CONTAINS 'golden'
   RETURN m.embedding IS NOT NULL AS hasEmb, size(m.embedding) AS dim
   ```
   Expect `hasEmb=true, dim=1536`.
4. **Create without key:** Remove key, create memory. Expect `hasEmb=false`, no crash, warning logged.
5. **Semantic hit:** With key set, retrieve `query="my dog"`. Expect golden retriever memory in results. Trace `scoreBreakdown.vector > 0`, reason contains "semantic".
6. **Fulltext-only fallback:** Without key, same query. Expect no crash, vector=0, reason contains "semantic search unavailable".
7. **Backfill:** `MATCH (m:Memory) WHERE m.embedding IS NULL RETURN count(m)` before/after migration — should drop to 0 for users with keys set.
8. **Connector sync:** Trigger Google Drive sync, spot-check Neo4j — new nodes have `embedding`.
9. **Web UI:** Chat retrieval → hover memory ref → popover shows 4 scores + reason.

---

## Unresolved questions

1. **Re-embed on update?** `updateMemory` can change title/content. Current plan doesn't re-embed — stale embeddings grow over time. Add re-embed there too, or defer?
2. **Embedding cost visibility?** Each user pays for their own embedding via OpenRouter. Surface cost estimate anywhere, or leave silent?
3. **Vector dim guardrail?** If user swaps embedding model later (different dims), index breaks. Enforce `dim === 1536` at service boundary?
4. **Popover trigger location** — memory refs inline in chat, or per-memory detail page only? Inline popover risks hover noise.
5. **Migration order** — backfill oldest-first (current plan) vs newest-first? Newest memories likely queried more — better UX faster.
6. **Cold-start cost for retrieve** — embedding call adds ~200-400ms to every retrieve. Acceptable, or cache query embeddings (e.g. `@convex-dev/action-cache` already in deps)?
