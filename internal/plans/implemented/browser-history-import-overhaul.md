# Browser History Import Overhaul

**Implemented:** 2026-04-25

## Problem

Importing 500 browser history items created ~125,000 junk edges (`O(n²)`), making the graph unusable. The "same session" heuristic in `createMemory()` was designed for interactive use but applied to batch imports:

```typescript
// OLD: Connected ALL memories from same source created in last 15 min
const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
await session.run(
  `MATCH (m:Memory {id: $id}), (m2:Memory {userId: $userId, source: $source})
   WHERE m2.id <> $id AND m2.createdAt > $cutoff
   MERGE (m2)-[r:RELATES_TO]->(m)
   ON CREATE SET r.reason = 'same session'`,
);
```

## Solution

### Phase 1: Stop Creating Junk Edges

**Batch sources skip same-session edges entirely:**

```typescript
const BATCH_SOURCES = new Set([
  "browsing-history",
  "bookmarks",
  "google_drive",
  "notion",
  "onedrive",
  "linear",
  "gmail",
]);

if (!BATCH_SOURCES.has(params.source)) {
  // Only create same-session edges for interactive sources
}
```

**Migration to clean up existing junk:**

```typescript
// Run via Convex dashboard
internal.neo4jActions.migration.deleteJunkSessionEdges({ clerkId: "..." });
```

### Phase 2: URL Normalization + Visit Tracking

**Extended tracking params (30+):**

- UTM: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`
- Social/ad: `fbclid`, `gclid`, `gclsrc`, `dclid`, `msclkid`, `twclid`, `igshid`
- Email: `mc_cid`, `mc_eid`, `mkt_tok`
- General: `ref`, `source`, `referrer`, `_ga`, `_gl`, `sessionid`, `trk`, `affiliate`

**Visit count tracking:**

```typescript
// New fields on Memory node
visitCount: 1,
firstVisitAt: $now,
lastVisitAt: $now

// On duplicate URL detection
await service.incrementVisitCount(userId, existingMemoryId);
```

### Phase 3: Better Relationships

**Same-domain edges (limited to 10):**

```cypher
MATCH (m:Memory {id: $id})
MATCH (m2:Memory {userId: $userId})
WHERE m2.id <> $id
  AND m2.url IS NOT NULL
  AND m2.url STARTS WITH 'https://' + $domain
WITH m, m2 LIMIT 10
MERGE (m)-[r:RELATES_TO]->(m2)
ON CREATE SET r.reason = 'same domain'
```

**Referrer chain infrastructure (deferred):**

- Added `buildVisitMap()` and `getReferrerUrl()` helpers to Chrome extension
- Full implementation requires API changes to pass referrer URL to backend

## Files Changed

| File                                                     | Change                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `packages/backend/src/neo4j/memoryService.ts`            | Skip same-session for batch sources, add same-domain edges, add `incrementVisitCount()`, add `deleteJunkSessionEdges()` |
| `packages/backend/src/neo4j/url.ts`                      | Extended tracking params from 10 to 30+                                                                                 |
| `packages/backend/convex/neo4jActions/memories.ts`       | Call `incrementVisitCount()` on duplicate URL                                                                           |
| `packages/backend/convex/neo4jActions/migration.ts`      | Added `deleteJunkSessionEdges` migration action                                                                         |
| `apps/chrome-extension/src/background/import-history.ts` | Added referrer chain helpers                                                                                            |

## Research Sources

### Supermemory Patterns

- Uses `customId` for dedup (external ID like tweet ID)
- 409 Conflict silently skipped
- Batch API: `/documents/batch`, 100 items/batch
- Relationships: auto-generated Updates/Extends/Derives (not same-session spam)

### Best Practices

- **URL normalization**: Strip tracking params before storage
- **Visit aggregation**: One memory per canonical URL, track `visitCount`
- **Session boundaries**: 30-minute inactivity gap (academic standard)
- **Useful relationship signals**:
  - Same domain (cheap, useful clustering)
  - Referrer chain (navigation graph)
  - Topic similarity (embeddings)
  - Temporal proximity within sessions

## Future Work

1. **Referrer chain edges**: Create `NAVIGATED_FROM` relationships using Chrome's `referringVisitId`
2. **Topic similarity edges**: Use embeddings to connect semantically similar pages across domains
3. **Session boundary detection**: 30-minute gap → new session, connect within-session pages
