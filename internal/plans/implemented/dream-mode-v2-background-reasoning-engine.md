# Dream Mode V2 — Background Reasoning Engine

## Context

vmem currently does enrichment **once** at memory ingestion: the LLM extracts tags, entities, and `RELATES_TO` edges, then stops. The system gets no smarter about a user the longer it observes them.

Honcho's Deriver pattern shows what's possible: a background worker that periodically scans recent memories, finds anomalous/novel ones via surprisal scoring, and uses an LLM to synthesize **derived insights** linked back to source memories. Insights consolidate over time, contradictions get flagged, and the user's representation deepens without any explicit action.

vmem already has the substrate Honcho lacks (Neo4j graph, vector index, multi-hop retrieval, Context Trace). What's missing is the temporal dimension of synthesis. We also already have a working `/proposals` route with approve/reject UI for `:ProposedUpdate` nodes — perfect surface area to attach synthesis proposals to without inventing a new UI primitive.

This plan adds Dream Mode V2: a daily cron + manual trigger that produces 4 synthesis types (insights, connections, contradictions, anomalies) and routes them through the existing proposals queue, with an opt-in per-profile auto-accept toggle for users who trust the quality.

---

## Decisions (from Q&A)

| Question        | Answer                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| Approval flow   | **Both** — default to proposals queue; per-profile `dreamModeAutoAccept` toggle |
| Trigger         | **Daily cron + manual button** on `/proposals` page                             |
| Synthesis types | **All 4**: insight, connection, contradiction, anomaly                          |
| Source schema   | **Add `sourceMemoryIds` array** to `:ProposedUpdate` node                       |

---

## Architecture

```
Daily cron (4am UTC)              Manual button on /proposals
       │                                       │
       ▼                                       ▼
runDreamForAllUsersInternal       runDreamForActiveProfile (rate-limited 1/hr)
       │                                       │
       └──────────────┬────────────────────────┘
                      ▼
           runDreamForProfileInternal (per profile, idempotent)
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
   1. Recent      2. Surprisal    3. Cluster anomalies
      memories       scoring         (1-hop neighbors:
      (last 7d)     (k=5 NN          RELATES_TO + MENTIONS)
                    cosine)
                      │
                      ▼
        4. LLM call per cluster (Qwen3-235B)
           → { type, title, content, reason, sourceMemoryIds, confidence }
                      │
                      ▼
        5. Dedup against existing pending proposals
           (skip if sourceMemoryIds overlap ≥ 50% with a pending one)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  auto-accept = true        auto-accept = false (default)
        │                           │
        ▼                           ▼
  Create :Memory          Create :ProposedUpdate
  type='insight'          kind ∈ {insight, connection,
  source='dream-mode'           contradiction, anomaly}
  + :DERIVED_FROM edges    sourceMemoryIds: [...]
        │                           │
        └─────────────┬─────────────┘
                      ▼
                Emit MemoryEvent
```

### Surprisal scoring

For each memory M created in the last 7 days:

1. Use `db.index.vector.queryNodes('memory_embedding', 6, M.embedding)` to find 5 nearest neighbors (excluding self)
2. `surprisal(M) = 1 - mean(cosineSimilarity(M, neighbor_i))` for i=1..5
3. Sort all M by surprisal desc, take top 10

This is cheap: one vector query per recent memory, no LLM.

### Clustering

For each top-surprisal memory, fetch its 1-hop graph neighborhood (`RELATES_TO` + memories sharing `MENTIONS` entities). Group anomalies that share ≥1 neighbor into clusters. Cluster size cap: 8 memories (LLM token budget).

- Singleton cluster → likely **anomaly** (memory unlike others)
- 2-3 memories sharing entity but no `RELATES_TO` → likely **connection**
- 2+ memories with conflicting content (LLM decides) → **contradiction**
- 3+ memories with shared theme → **insight**

The LLM picks the type — we just feed it the cluster.

### LLM contract

Per cluster, single call:

```
Input: cluster of memories (id, title, content, tags, related entities)
Output JSON: {
  type: "insight" | "connection" | "contradiction" | "anomaly" | "skip",
  title: string,
  content: string,
  reason: string,
  sourceMemoryIds: string[],
  confidence: number (0-1)
}
```

`type: "skip"` → no proposal created. Confidence < 0.6 → skip. This kills false positives early.

---

## Schema changes

### Convex (`packages/backend/convex/validators.ts`)

Add to `profileFields`:

```ts
dreamModeAutoAccept: v.optional(v.boolean()),    // default false
lastDreamRunAt: v.optional(v.number()),          // wall-clock ms, for rate-limiting manual button
```

### Neo4j (`:ProposedUpdate` node)

Extend `kind` enum: `"update" | "delete" | "insight" | "connection" | "contradiction" | "anomaly"`

Add property: `sourceMemoryIds: string[]` (array of memory UUIDs the synthesis derives from). For existing `update`/`delete` proposals this is `[]`.

Add property: `proposedTitle: string | null` (synthesis proposals need a title; updates rewrite existing memory's content, no title change).

Add property: `confidence: number | null` (LLM-reported, helps user prioritize).

Add property: `source: "v2-extraction" | "dream-mode"` for attribution.

No migration required for existing proposals — new fields are optional, current `update`/`delete` rows read with defaults.

### Neo4j (`:Memory` node — for materialized insights)

No node-level changes. Insights materialize as regular `:Memory` with:

- `type = "knowledge"` (V1; we can introduce `type = "insight"` later if filtering needs it)
- `source = "dream-mode"` (already a free-form string)

Add edge type: `:DERIVED_FROM` from new memory to each source memory. Pure-Cypher creation in `resolveProposal` when `kind ∈ {insight, connection, anomaly}`.

---

## Files to create / modify

### New files

| File                                                          | Purpose                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `packages/backend/convex/crons.ts`                            | Daily cron config — first crons file in repo                                                                  |
| `packages/backend/convex/neo4jActions/dreamMode.ts`           | `runDreamForAllUsersInternal`, `runDreamForProfileInternal`, `runDreamForActiveProfile` (manual button entry) |
| `packages/backend/src/neo4j/dreamPrompt.ts`                   | LLM prompt builder for synthesis (mirrors `enrichmentPrompt.ts`)                                              |
| `apps/web/src/components/proposals/RunDreamModeButton.tsx`    | Manual trigger button on `/proposals` page                                                                    |
| `apps/web/src/components/proposals/SynthesisProposalCard.tsx` | New card variant for synthesis kinds (shows source memory list, confidence, type badge)                       |

### Modified files

| File                                                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/backend/convex/validators.ts`                             | Add `dreamModeAutoAccept`, `lastDreamRunAt` to `profileFields`                                                                                                                                                                                                                                                                                                                                                                      |
| `packages/backend/src/neo4j/memoryService.ts`                       | Extend `ProposedUpdateKind` enum; update `createProposedUpdate` signature to accept `sourceMemoryIds`, `proposedTitle`, `confidence`, `source`; new method `createSynthesisProposal`; update `resolveProposal` to handle synthesis kinds (creates new `:Memory` + `:DERIVED_FROM` edges on approve); new `findRecentMemoriesForDream`, `computeSurprisalForMemories`, `findOverlappingPendingProposals`; new `setDreamRunTimestamp` |
| `packages/backend/convex/proposedUpdateApi.ts`                      | Update `ProposedUpdateNode` type to include synthesis fields; extend `kind` validator union                                                                                                                                                                                                                                                                                                                                         |
| `packages/backend/convex/profiles.ts`                               | Add `setDreamModeAutoAccept` mutation; expose `dreamModeAutoAccept` in queries                                                                                                                                                                                                                                                                                                                                                      |
| `apps/web/src/routes/_main/proposals.tsx`                           | Render synthesis cards via new component; add "Run Dream Mode" button in header                                                                                                                                                                                                                                                                                                                                                     |
| `apps/web/src/hooks/useProposals.ts`                                | Type updates for new `kind` values + new fields                                                                                                                                                                                                                                                                                                                                                                                     |
| `apps/web/src/routes/_main/profiles/$profileId.tsx` (or equivalent) | Toggle for `dreamModeAutoAccept` per profile                                                                                                                                                                                                                                                                                                                                                                                        |

---

## Reused patterns

| Reuse                              | Source path                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Self-rescheduling cursor batch     | `packages/backend/convex/neo4jActions/migration.ts:159–224` (`backfillEmbeddingsInternal`) — model for `runDreamForAllUsersInternal` |
| Per-user OpenRouter key resolution | `packages/backend/convex/lib/envVars.ts:89–98` (`tryUserEnvVarByClerkId`)                                                            |
| OpenRouter call shape              | `packages/backend/convex/neo4jActions/enrichment.ts:14–60` — copy structure, swap prompt + JSON schema                               |
| Vector index query                 | `packages/backend/src/neo4j/memoryService.ts:475` (`db.index.vector.queryNodes`) — same call for surprisal scoring                   |
| Audit log shape                    | `packages/backend/convex/proposedUpdateApi.ts:80–91` — extend with `proposed_update.dream_run` event                                 |
| MemoryEvent emission               | `packages/backend/convex/memoryEvents.ts` — add `dream_synthesis_created` event type                                                 |
| Embedding helper                   | `packages/backend/src/neo4j/embeddingService.ts` — already batched, reuse for new memory if synthesis materializes                   |

---

## Implementation phases

**Phase A — Schema + types (no behavior change)**

1. Extend `:ProposedUpdate` `kind` enum and add new optional properties
2. Update `ProposedUpdateNode` TypeScript type + validators
3. Update `useProposals` hook types
4. Add `dreamModeAutoAccept` + `lastDreamRunAt` to profile fields
5. `npx convex codegen --typecheck enable` — verify clean

**Phase B — Backend Dreamer pipeline**

1. Add `findRecentMemoriesForDream(userId, sinceMs)` to `memoryService`
2. Add `computeSurprisalForMemories(userId, memoryIds)` — vector queries, returns sorted list
3. Add `clusterAnomalies(userId, anomalyIds)` — Cypher to fetch 1-hop neighborhoods
4. Build `dreamPrompt.ts` with the synthesis schema
5. Implement `runDreamForProfileInternal` orchestrator
6. Implement `findOverlappingPendingProposals` for dedup
7. Add `createSynthesisProposal` and the auto-accept materialization path

**Phase C — Triggering**

1. Create `crons.ts` with daily entry → `runDreamForAllUsersInternal`
2. `runDreamForAllUsersInternal` iterates active profiles, schedules per-profile runs (self-rescheduling cursor pattern)
3. Add `runDreamForActiveProfile` action with rate-limit (60 min via `lastDreamRunAt`)

**Phase D — `resolveProposal` for synthesis kinds**

1. Extend Cypher in `resolveProposal` to handle `kind ∈ {insight, connection, anomaly}`: create new `:Memory` + `:DERIVED_FROM` edges on approve
2. Contradiction kind: V1 just dismisses on approve/reject (user manually resolves underlying conflict). Add TODO comment for V2 structured resolution.
3. Emit appropriate MemoryEvent on materialization

**Phase E — UI**

1. Build `SynthesisProposalCard` with: type badge, title, content, source memory list (links to each memory), confidence bar, reason, approve/reject
2. Update `proposals.tsx` to dispatch on `kind` (existing card for update/delete, new card for synthesis kinds)
3. Add "Run Dream Mode" button in `rightSection` of `PageContainer`
4. Add `dreamModeAutoAccept` toggle to profile settings UI

**Phase F — Polish**

1. Empty-state copy update (mention Dream Mode)
2. Activity feed entries for `dream_synthesis_created`
3. Rate-limit error toast for manual button

---

## Cost / safety

- **LLM cost**: ~5–10 cluster calls per user per day = $0.05–$0.10/user/day at Qwen3-235B prices
- **Vector queries**: 10–50 queries/user/day (cheap, indexed)
- **Manual button**: rate-limited to 1/hr per profile via `lastDreamRunAt`
- **Cron clamping**: Process at most N=20 profiles per scheduled tick; reschedule if more pending. Avoids long-running actions.
- **Soft-fail**: If user has no `OPENROUTER_API_KEY`, skip silently (consistent with enrichment behavior)
- **Confidence floor**: LLM outputs with `confidence < 0.6` are dropped before proposal creation
- **Dedup**: Before creating a proposal, check for pending proposals with ≥50% overlap in `sourceMemoryIds` — prevents re-proposing the same insight

---

## Verification

End-to-end test flow:

1. Run `npx convex codegen --typecheck enable` in `packages/backend` — confirm clean types
2. From Convex dashboard, manually invoke `runDreamForActiveProfile` for a test user with ≥10 memories
3. Confirm console logs show: recent memory count, surprisal scores, cluster count, LLM calls, proposals created
4. Visit `/proposals` — see synthesis cards rendered with type badges, source memory links, confidence
5. Click approve on an insight → confirm new `:Memory` created with `source='dream-mode'` + `:DERIVED_FROM` edges to source memories (Cypher query: `MATCH (m:Memory {source: 'dream-mode'})-[:DERIVED_FROM]->(src) RETURN m, src`)
6. Toggle `dreamModeAutoAccept` to true on profile, run Dream Mode again, confirm new memories materialize directly (no proposal step)
7. Run Dream Mode twice in succession on same data — confirm dedup prevents duplicate proposals (sourceMemoryIds overlap check)
8. Cron test: temporarily set cron to fire every 1 minute, confirm it runs and exits cleanly when no recent memories
9. Click manual button twice within 60 minutes → confirm rate-limit toast
10. Activity feed: confirm `dream_synthesis_created` events appear

Smoke check after deploy:

- Watch Convex logs after first daily cron fire
- Verify `lastDreamRunAt` updates per profile
- No errors in audit log for `proposed_update.dream_run` actions
