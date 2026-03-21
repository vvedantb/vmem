# Extension Dedup + Smart Tags + Auto-Linking

**Date:** 2026-03-21
**Status:** Approved

## Problem

1. **Duplicate memories**: No deduplication — saving the same page creates a new memory every time, leading to 20+ identical nodes in the graph.
2. **Meaningless relationships**: Extension only tags with hostname (e.g. `github.com`), so all pages from the same domain cluster together. No semantic understanding of content.

## Design

### 1. Store URL on Memory Nodes

Memory nodes currently lack a `url` field. The hostname is extracted for tags but the full URL is discarded.

**Changes:**

- Add optional `url: z.string().url().optional()` to `createMemorySchema` in `memories.ts`
- Store `url` property on Memory node in Neo4j
- Add Neo4j unique constraint on `(userId, url)` — enforces uniqueness at DB level, prevents race conditions
- Extension passes full URL in `POST /v1/memories` body

**URL Normalization:** Before storage and lookup, URLs are canonicalized:

- Strip trailing slashes
- Strip hash fragments (`#section`)
- Strip tracking query params (`utm_*`, `ref`, `fbclid`)
- Normalize to lowercase hostname
- Preserve meaningful query params (e.g. `?id=123`, `?q=search`)

This lives in a shared `normalizeUrl(url: string): string` utility in `apps/api/src/lib/url.ts`.

### 2. Deduplication via 409 Response

No new endpoint. The existing `POST /v1/memories` checks for duplicates before creating.

**API flow:**

1. If `url` is provided, normalize it, then query: `MATCH (m:Memory {userId: $userId, url: $url}) WHERE m.status IN ['active', 'pinned'] RETURN m LIMIT 1`
2. If match found: return `409 Conflict` with `{ existingMemory: { id, title, updatedAt } }`
3. If no match: create normally, return `201`
4. If the unique constraint is violated (race condition), catch the error and return `409`

**Extension flow (individual saves):**

1. `POST /v1/memories` with url field
2. If `201`: done (proceed to enrichment)
3. If `409`: show confirmation toast — "Already saved — update?" with Update / Dismiss buttons. Toast auto-dismisses after 5s.
   - User confirms: `PATCH /v1/memories/:id` with `{ title, content }` (existing endpoint, already supports partial updates)
   - User declines: no-op

**Extension flow (bulk imports):**

- During bulk import (bookmarks/history), duplicates are silently skipped — no confirmation toast per item. The import summary shows: "Imported 150 new, skipped 50 duplicates."

**Update re-triggers enrichment:** After a successful PATCH, the API fires enrichment for the updated content.

### 3. LLM-Powered Enrichment (Tags + Auto-Linking)

Single LLM call per memory handles both semantic tagging and relationship discovery.

**Trigger:** After memory creation (201) or update (PATCH). Runs asynchronously — memory is saved immediately, enrichment happens in background.

**New service:** `apps/api/src/services/memory-enrichment.ts`

**Model:** `google/gemini-2.0-flash` via OpenRouter — cheap, fast, reliable structured JSON output. Configurable via env var `ENRICHMENT_MODEL`.

**Input to LLM:**

- New memory's title + content (hard truncated at 2000 characters at nearest word boundary)
- Titles + IDs of user's last 30 active memories, ordered by `updatedAt DESC`

**LLM prompt (via OpenRouter):**

```
You are a memory tagging system. Given a memory and a list of existing memories:

1. Generate 3-5 semantic topic tags for this memory. Tags should be lowercase, specific, and reusable (e.g. "react", "authentication", "graph-algorithms", "typescript"). Avoid generic tags like "programming" or "article".

2. From the provided list, identify any memories that are semantically related to this one. Only include strong relationships — shared topic, continuation of the same work, or direct reference.

Memory:
Title: {title}
Content: {content}

Existing memories:
{id}: {title}
{id}: {title}
...

Respond in JSON:
{
  "tags": ["tag1", "tag2", "tag3"],
  "relatedMemoryIds": ["id1", "id2"]
}
```

**Response validation (Zod):**

- Parse JSON; on failure, fall back to hostname tag
- `tags`: array of strings, max 5, each lowercase, max 50 chars, strip non-alphanumeric (except hyphens)
- `relatedMemoryIds`: array of strings, filtered to only IDs present in the provided list (prevents cross-user linking or hallucinated IDs)

**After LLM response:**

1. Remove ALL existing `TAGGED_WITH` edges for this memory (hostname tags replaced by semantic tags)
2. MERGE new Tag nodes + `TAGGED_WITH` edges for each semantic tag
3. On re-enrichment (PATCH): also delete existing `RELATES_TO` edges where `reason = 'content similarity'` before creating new ones. Preserve edges with other reasons (e.g. `"same session"`, `"user linked"`).
4. Create `RELATES_TO` edges with reason `"content similarity"` for each related memory ID
5. Push single `memory_enriched` event via existing WebSocket system after all edges are created, so graph updates live

**Error handling:** If LLM call fails, memory keeps its hostname tag as fallback. No retry — enrichment is best-effort.

### 4. Bulk Import Handling

Same enrichment pipeline, but batched:

- Process memories in batches of 5 with 500ms delay between batches
- Extension shows progress: "Enriching 45/200..."
- Each memory in the batch gets its own LLM call (content varies per page)
- Dedup during bulk: 409s are silently skipped (see section 2)

For bookmarks import specifically: content is just `"title\nurl"` — LLM will generate tags from the title/URL alone, which is still better than hostname-only.

### 5. Existing Same-Session Auto-Linking

The current 15-minute same-source `RELATES_TO` logic in `createMemory()` stays. LLM-based linking supplements it — both can coexist since `MERGE` prevents duplicate edges.

## Files Touched

| File                                                        | Change                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/api/src/routes/memories.ts`                           | Add `url` to schema, 409 dedup logic                                          |
| `apps/api/src/db/memory-service.ts`                         | Store `url` on node, normalize before storage, dedup query, unique constraint |
| `apps/api/src/lib/url.ts`                                   | **New** — `normalizeUrl()` utility                                            |
| `apps/api/src/services/memory-enrichment.ts`                | **New** — LLM tagging + auto-linking service                                  |
| `apps/chrome-extension/src/background/message-handler.ts`   | Handle 409, trigger update flow                                               |
| `apps/chrome-extension/src/background/api-client.ts`        | Pass url field in create calls                                                |
| `apps/chrome-extension/src/popup/_components/QuickSave.tsx` | Confirmation toast on duplicate                                               |
| `apps/chrome-extension/src/background/context-menu.ts`      | Pass url to API                                                               |
| `apps/chrome-extension/src/background/import-bookmarks.ts`  | Silent dedup skip + enrichment progress                                       |
| `apps/chrome-extension/src/background/import-history.ts`    | Silent dedup skip + enrichment progress                                       |

## Out of Scope

- Embedding-based similarity (vector index) — future enhancement if LLM linking isn't accurate enough
- Retroactive enrichment of existing memories — can be added as a migration later
- Tag management UI (merge, rename, delete tags) — separate feature
