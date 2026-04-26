# Should vmem install @convex-dev/action-cache?

## Context

Dashboard feels slow. Root cause suspected to be Neo4j read actions (`getGraphDataInternal`, `getStatsInternal`, etc.) firing on every tab switch / revalidation with zero caching layer. User tolerates ~seconds of staleness on reads.

Question: install action-cache component to speed this up?

## Recommendation: **Yes — but narrowly scoped, and fix the Cypher first.**

Action-cache is designed for expensive-and-idempotent calls (embeddings, LLM). Neo4j Cypher queries are faster than those but are still the slowest thing on the dashboard's hot path and called repeatedly with the same args — so caching does pay off _if_ you wrap only the right ones.

However, two findings from exploration change the priority order:

- `getGraphDataInternal` runs **2 parallel Neo4j sessions** then does **O(n²) tag-edge computation client-side** — optimize the query first; caching a slow query is a band-aid.
- `getStatsInternal` recomputes **7-day cumulative series on every call** — historical days never change, but current code recomputes them anyway.

So: **optimize first, then cache the remaining latency.**

---

## Step 1 — Optimize the Cypher (do first, no new dep)

### `getGraphDataInternal` — `packages/backend/convex/graph.ts`

- Collapse the 2 parallel sessions into 1 session with 2 queries OR use `UNION` to return nodes + edges in one round-trip.
- Move tag-edge computation from client-side O(n²) loop into Cypher: `MATCH (m1:Memory)-[:TAGGED_WITH]->(t:Tag)<-[:TAGGED_WITH]-(m2:Memory) WHERE m1._id < m2._id` (returns pairs once, no dedup needed).

### `getStatsInternal` — `packages/backend/convex/dashboard.ts`

- The `range(0, 6) + UNWIND + OPTIONAL MATCH` pattern that recomputes cumulative totals per day is O(7×n). Replace with a single aggregate query bucketed by day, computed server-side.

### `listMemoriesInternal` / `searchMemoriesInternal` — `packages/backend/convex/memories.ts`

- Tag-filter subquery (`size([(m)-[:TAGGED_WITH]->(ft:Tag) WHERE ft.name IN $filterTags | ft])`) scans all relationships per memory. Rewrite as a join that short-circuits on the tag index.
- Combine count + fetch into one query with `CALL { ... } IN TRANSACTIONS` or return count as a window aggregate.

**If the dashboard feels fast after Step 1, stop. Don't install action-cache.**

---

## Step 2 — Install action-cache (only if Step 1 isn't enough)

### Install

```
npm install @convex-dev/action-cache --workspace=packages/backend
```

### Configure

`packages/backend/convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import cache from "@convex-dev/action-cache/convex.config.js";

const app = defineApp();
app.use(cache);
export default app;
```

### Wrap **only** these actions

| Action                      | File           | TTL | Why                                                                       |
| --------------------------- | -------------- | --- | ------------------------------------------------------------------------- |
| `getGraphDataInternal`      | `graph.ts`     | 30s | Large payload (~500KB), expensive traversal, user tolerates seconds stale |
| `getStatsInternal`          | `dashboard.ts` | 30s | Tiny payload, high repeat-call rate across tab switches                   |
| `getRecentActivityInternal` | `dashboard.ts` | 30s | Dashboard-only, stale-tolerant                                            |

Pattern per action:

```ts
const graphCache = new ActionCache(components.actionCache, {
  action: internal.graph.getGraphDataInternal,
  name: "getGraphData-v1",
  ttl: 30_000,
});

export const getGraphData = action({
  args: {
    clerkId: v.string(),
    focus: v.optional(v.string()),
    profileId: v.optional(v.id("profiles")),
  },
  handler: (ctx, args) => graphCache.fetch(ctx, args),
});
```

Cache key = stringified args, so `clerkId` + `profileId` + filters naturally scope per-user. No leak risk.

### Do NOT wrap

- `listMemoriesInternal` / `searchMemoriesInternal` — even 30s stale feels wrong when user just created a memory; primary list view needs immediate reflection
- `retrieveMemoriesInternal` / `mcpRetrieveMemories` / `mcpSearchMemories` — feed LLM context; staleness = wrong answers
- `getLocalGraphInternal` — per-memory focus, cache key explosion, low hit rate
- Everything else (writes, syncs, migrations, MCP create/update/delete, `ensureNeo4jSetup`)

### No manual invalidation needed

TTL of 30s means no write-path invalidation code. Trade-off: dashboard shows stats/graph up to 30s stale after a write. User said that's acceptable.

---

## Critical files

- `packages/backend/convex/graph.ts` — optimize + wrap `getGraphDataInternal`
- `packages/backend/convex/dashboard.ts` — optimize + wrap `getStatsInternal`, `getRecentActivityInternal`
- `packages/backend/convex/memories.ts` — optimize Cypher only (no caching)
- `packages/backend/convex/convex.config.ts` — register component (create if missing)
- `packages/backend/convex/neo4j.ts` (or equivalent driver helper) — consider adding `statementCacheSize` on driver init if not already set

## Verification

1. Before starting: time the dashboard's slow paths. Open Chrome DevTools → Network → measure p50/p95 for the Convex function calls backing the graph tab and stats panel. Record numbers.
2. After Step 1 (Cypher optimization): retime. If p95 dropped below ~300ms, you're done.
3. After Step 2 (caching): retime. Expect second navigation to the graph tab to be <50ms (cache hit).
4. Staleness test: create a memory, observe stats/graph update within 30s. Confirm lists/search reflect the new memory immediately (those aren't cached).
5. Typecheck: `cd packages/backend && npx convex codegen --typecheck enable`.

---

## Unresolved questions

1. **Do you want Step 1 (Cypher optimization) done first, or jump straight to installing action-cache?** Step 1 is a correctness/quality fix that pays off regardless; Step 2 is a bandage that also works. My recommendation is Step 1 → re-measure → Step 2 only if needed.
2. **TTL length**: 30s is a reasonable default given "seconds OK" tolerance. Want tighter (10s) for fresher data or looser (2min) for better hit rate on the stats growth series?
3. **Neo4j Aura region**: is the Aura instance in the same region as Convex deployment? If there's cross-region latency, the biggest win is moving Aura, not caching.
