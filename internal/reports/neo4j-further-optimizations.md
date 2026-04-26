# Further Neo4j optimization options for vmem

Context: AuraDB Free (200k node / 400k rel cap), 68,746 nodes, 395,384 relationships (99% of the rel cap). Next write may start failing. Rankings below are opinionated — do them in order.

## 1. Capacity first

**Do both, in this order: prune tomorrow, upgrade this week.** You're one heavy user away from write failures. Pruning buys breathing room for hours; upgrading removes the ceiling permanently. AuraDB Free is hard-capped at 200k nodes / 400k relationships on a single shared instance; **AuraDB Professional has no node/relationship limits** and is priced at **$65/GB/month** (1 GB minimum = ~$65/mo, scales to 128 GB). The clean migration path is Console → Snapshots → "Create database from snapshot" on the Free DB — it spins up a Professional instance pre-populated, preserving the DBID so your Bolt URI barely changes. While you wait: the cheapest prune is `TAGGED_WITH` edges on tags with `count(*) > 500` per user (already filtered out of the graph query, so dropping them costs you nothing visible), plus any `RELATES_TO` edges to `status = 'suppressed'` or `'expired'` memories. `MATCH (m:Memory {status:'expired'})-[r]-() DELETE r` will return tens of thousands of edges.

## 2. Query-side wins we have NOT tried yet

Ranked by expected impact for the graph endpoint specifically.

**2a. PROFILE the graph query and hunt `Eager` + high-dbHits operators.** Highest ROI — you're optimizing blind without this. The signal to kill: any operator whose `dbHits` is ≫ `rows` it emits, and any `Eager` box (forces full materialization, blows heap, serializes pipelines). Run once, paste the plan. Expected culprit: the `WITH m, collect(t.name) AS memTags` followed by `WITH collect({...}) AS nodes` — double `collect` is a classic Eager trigger.

```cypher
PROFILE MATCH (m:Memory {userId: $userId})
WHERE coalesce(m.status, 'active') IN ['active','pinned']
OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
WITH m, collect(t.name) AS memTags
RETURN count(*)
```

**2b. Replace `coalesce(m.status,'active') IN [...]` with a direct equality list.** This predicate is index-unfriendly — `coalesce` wraps the property so the planner can't use `(userId, status)` as a range seek. Backfill `status = 'active'` on the legacy nulls once, then the predicate becomes `m.status IN ['active','pinned']` which the composite index can serve as two seek-ranges.

```cypher
MATCH (m:Memory) WHERE m.status IS NULL SET m.status = 'active';
// then: WHERE m.status IN ['active','pinned']
```

**2c. Use QPP + `SHORTEST 1` for the focus view instead of `*1..2`.** Your `getFocusedGraphData` uses `OPTIONAL MATCH (focus)-[:RELATES_TO*1..2]-(neighbor)` — variable-length with no upper bound on per-hop cardinality. Neo4j 2025.06+ ships quantified path patterns with dramatically better planning; `SHORTEST 1` avoids path-count explosion on dense nodes.

```cypher
MATCH (focus:Memory {id: $focusId, userId: $userId})
OPTIONAL MATCH SHORTEST 1 (focus) ((:Memory)-[:RELATES_TO]-(:Memory)){1,2} (neighbor:Memory)
WHERE neighbor.userId = $userId
```

**2d. Parameterize everything; never string-interpolate `profileFilter` branches.** You currently build the query string conditionally (`profileFilter = "AND m.profileId = $profileId ..."`). Every branch is a _different_ cached plan. Collapse to one plan with a null-param trick:

```cypher
WHERE ($profileId IS NULL OR m.profileId = $profileId OR m.profileId IS NULL)
```

One plan, one cache slot, same predicate semantics.

**2e. Push `LIMIT` into the subquery, not after.** The `CALL ()` block collects _all_ `RELATES_TO` rows before the outer `RETURN`. For 2000-node users with dense relates-to, this is the memory spike. Add a `LIMIT 5000` inside the `CALL` and a second index on `(a.userId, a.status)` isn't needed because the planner already filters via `m` — but bounding the collect is essential for consistent p99.

## 3. Schema-side wins

**3a. Range index on `RELATES_TO.createdAt` if you add edge timestamps.** Propertyless today, so skip. _But_ if you ever want "recent first" ordering on relates-to edges you'll need it — plan it now.

**3b. Text index on `Memory.title` for prefix/contains searches in the list view.** Fulltext index is overkill for small substring filters; a TEXT index (B+tree with collation) is cheaper and usable by `STARTS WITH` / `CONTAINS`.

```cypher
CREATE TEXT INDEX memory_title_text IF NOT EXISTS FOR (m:Memory) ON (m.title);
```

**3c. Drop the single-column `memory_user_id` index.** Redundant with `(userId, createdAt)` and `(userId, status)` — the planner will use the composite's leading column. One fewer index to maintain on every write.

**3d. Use index hints sparingly — only after PROFILE confirms a bad choice.** `USING INDEX m:Memory(userId, status)` locks the planner in. Only pull this lever if 2a reveals it picking the wrong index.

## 4. Driver / network wins

**4a. Switch `session.run` → `session.executeRead` for all read queries.** You're using plain `session.run`, which gives zero retries on transient connection blips (Aura drops idle connections, Convex containers nap for minutes). `executeRead` gives managed transactions with automatic retry on `TransientError` / `SessionExpired` and routes over `READ` servers if Aura later exposes read replicas.

```ts
await session.executeRead((tx) => tx.run(cypher, params));
```

**4b. Prefer `driver.executeQuery(..., { routing: neo4j.routing.READ })` for one-shot reads.** No session management, handles retries + bookmarks internally, routes reads away from the leader. Good fit for Convex actions where you don't need cross-query consistency.

**4c. Use async-iterator streaming for the nodes payload, drop `.records` array.** Current code waits for `await session.run(...)` to collect _everything_ then maps. For 2000 nodes that's a ~1-2 MB JSON buffer built twice. `for await (const record of result)` streams through a fixed-size fetch window (default 1000) and lets you serialize to the HTTP response incrementally.

**4d. Query bookmarks for the "save memory → immediately view graph" flow.** If a user saves then navigates to the graph fast, a read may hit a replica that hasn't seen the write. Capture `session.lastBookmarks()` after writes and pass to the next session's `{ bookmarks: [...] }`. Free on single-instance today; needed the day you move to HA.

**4e. Set a per-query `timeout` via transactionConfig.** Aura's infra timeout is 60s and kills the whole connection on hit; a 5s client timeout surfaces a clean error without poisoning the pool.

```ts
driver.executeQuery(cypher, params, { transactionConfig: { timeout: 5000 } });
```

## 5. Counterintuitive

**5a. The tag-edges query is the wrong problem shape.** You're computing co-tag weights _server-side every request_ for a viewport that 95% of users won't scroll through. Most teams reach for query optimization; the win is **materializing `(m1)-[:COTAG {weight, tags}]->(m2)` as a real edge**, refreshed nightly or on-write. Query becomes `MATCH (m:Memory {userId:$userId})-[c:COTAG]->(n) RETURN ...` — one index seek + one relationship expand, no aggregation, no pre-filter, no `m1.id < m2.id` hack. Trades storage (you're already near the rel cap — do this _after_ upgrading) for O(1) reads.

**5b. Send `type: "bolt+s"` not `neo4j+s` if you don't need routing.** `neo4j+s://` does a routing-table discovery handshake on every driver init; `bolt+s://` skips it. On AuraDB Free (single instance, no cluster) the routing table is a round-trip you pay for nothing. Shave 50-100ms off cold-start Convex containers.

---

## Action order

1. Take a snapshot, upgrade to AuraDB Professional ($65/mo, 1GB). ~15 min, unblocks writes permanently.
2. Run `PROFILE` on the two graph queries; post the plan. ~10 min.
3. Backfill `status` nulls + drop `coalesce` wrapper. ~30 min.
4. Migrate `session.run` → `session.executeRead` across `memoryService.ts` reads. ~45 min.
5. Everything else is tuning; schedule after a week of profiling data.

---

## Sources

- [Neo4j Pricing](https://neo4j.com/pricing/) — $65/GB/month Professional, no node/rel limits
- [Just upgraded to paid tier AuraDB professional (community)](https://community.neo4j.com/t/just-upgraded-to-paid-tier-auradb-professional-still-subject-to-4000-relationships-limit/74366)
- [Support resources and FAQ for Aura Free Tier](https://support.neo4j.com/s/article/16094506528787-Support-resources-and-FAQ-for-Aura-Free-Tier) — Free tier 200k/400k hard cap
- [Neo4j Aura migrating Free to another tier](https://neo4j.com/docs/aura/auradb/tutorials/migration-free) — snapshot-based upgrade flow
- [AuraDB Free to AuraDB Professional changelog](https://neo4j-aura.canny.io/changelog/auradb-free-to-auradb-professional) — DBID preserved on upgrade
- [Database hits — Cypher Manual](https://neo4j.com/docs/cypher-manual/current/execution-plans/db-hits/)
- [Execution plan operators in detail](https://neo4j.com/docs/cypher-manual/current/execution-plans/operators/)
- [Avoiding Eager — Mark Needham](https://www.markhneedham.com/blog/2014/10/23/neo4j-cypher-avoiding-the-eager/)
- [Tuning Cypher queries by understanding cardinality](https://neo4j.com/developer/kb/understanding-cypher-cardinality/)
- [Neo4j JavaScript driver — streaming + executeQuery](https://github.com/neo4j/neo4j-javascript-driver) — `executeRead`, `routing.READ`, async iterator, bookmarks
- [Quantified path patterns — Cypher cheat sheet](https://neo4j.com/docs/cypher-cheat-sheet/current)
