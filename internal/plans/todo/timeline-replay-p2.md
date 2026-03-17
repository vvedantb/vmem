# Phase 2: RELATES_TO Edges Between Memories

## Context

Assumes Phase 1 (Timeline/Replay page with snapshots) is fully implemented. This phase adds direct memory-to-memory relationships via `RELATES_TO` edges in Neo4j. Two creation paths: auto-linking (same source within 15min window) and manual linking (detail panel + graph drag). Enhances Topic Trail to traverse edges for richer decision trails.

## Decisions Made

- **Auto-link heuristic**: Same source + within 15 minutes
- **Manual linking**: Both memory detail panel and graph view (drag-to-link)
- **Edge metadata**: Minimal — `reason` string only (e.g., "same session", "user linked")
- **Topic Trail integration**: Tags + edges combined — tag-matched memories expanded 1 hop via RELATES_TO
- **Edge direction**: Bidirectional semantics (query with undirected match), stored as older → newer

---

## Phase 2A: Backend — RELATES_TO Relationship

### Step 1: Auto-link on memory creation

**File**: `apps/api/src/db/memory-service.ts`

In `createMemory()`, after creating the memory node:

- Query for existing memories from same user + same source + created within last 15 min
- For each match, CREATE `(existing)-[:RELATES_TO {reason: 'same session'}]->(new)`
- Single Cypher query: `MATCH (m2:Memory {userId: $userId, source: $source}) WHERE m2.id <> $id AND datetime(m2.createdAt) > datetime($cutoff) CREATE (m2)-[:RELATES_TO {reason: 'same session'}]->(m:Memory {id: $id})`

### Step 2: Manual link/unlink service methods

**File**: `apps/api/src/db/memory-service.ts`

New methods:

- `linkMemories(userId, memoryIdA, memoryIdB, reason)` — Creates RELATES_TO edge between two memories (verify both belong to userId). Returns success boolean.
- `unlinkMemories(userId, memoryIdA, memoryIdB)` — Removes RELATES_TO edge between two memories. Direction-agnostic match: `(a)-[:RELATES_TO]-(b)`
- `getRelatedMemories(userId, memoryId)` — Returns memories connected via RELATES_TO (1 hop, undirected). Returns `MemoryWithTags[]` + reason string per edge.

### Step 3: New API endpoints

**New file**: `apps/api/src/routes/relationships.ts`

Follow `dashboard.ts` pattern:

- `POST /link` — Body: `{ memoryIdA, memoryIdB, reason? }`. Default reason: "user linked". Calls `linkMemories()`
- `DELETE /link` — Body: `{ memoryIdA, memoryIdB }`. Calls `unlinkMemories()`
- `GET /memory/:id` — Returns related memories for a given memory. Calls `getRelatedMemories()`

### Step 4: Register route

**File**: `apps/api/src/index.ts`

- Import relationships route
- `app.use("/relationships/*", authMiddleware)`
- `app.route("/relationships", relationships)`

### Step 5: Enhance Topic Trail query

**File**: `apps/api/src/db/memory-service.ts`

Update `getTopicTimeline()` (from Phase 1):

- After matching memories by tag, ALSO match memories connected via RELATES_TO (1 hop, undirected)
- `OPTIONAL MATCH (m)-[:RELATES_TO]-(related:Memory {userId: $userId})`
- Collect both tag-matched and edge-connected memories, deduplicate by id
- Fetch events for all, return in chronological order
- Add a `connectionType` field to each timeline entry: "tag" or "related" so the UI can distinguish

---

## Phase 2B: Frontend — Memory Detail Panel Linking

### Step 6: Related memories section in detail panel

**File**: `apps/web/components/MemoryDetailPanel.tsx`

Add "Related Memories" section below existing content:

- Fetch `GET /v1/relationships/memory/:id` on memory select
- Display as list of memory cards with title + reason badge
- Each card has an "Unlink" button (calls `DELETE /v1/relationships/link`)
- "Link memory" button at bottom opens a search modal

### Step 7: Link memory modal

**New file**: `apps/web/components/LinkMemoryModal.tsx`

- `"use client"`, dialog from @vmem/ui
- Search input that filters from MemoryContext memory list
- Click a memory → calls `POST /v1/relationships/link` with both IDs
- Closes modal, refreshes related memories list

---

## Phase 2C: Frontend — Graph View Drag-to-Link

### Step 8: Add drag-to-link interaction to graph

**File**: `apps/web/app/(main)/memories/graph/` (existing graph component)

- On node mousedown + drag to another node → show a dashed line preview
- On drop onto target node → call `POST /v1/relationships/link`
- Render RELATES_TO edges distinctly from tag-based edges (different color/style — dashed vs solid)
- Need to fetch RELATES_TO edges separately: `GET /v1/relationships/memory/:id` for selected nodes, or add a bulk endpoint

### Step 9: Bulk relationships endpoint (for graph)

**File**: `apps/api/src/routes/relationships.ts`

Add: `GET /all` — Returns all RELATES_TO edges for the user as `{ source: memoryId, target: memoryId, reason }[]`. The graph view needs all edges at once to render them.

Add to service: `getAllRelationships(userId)` — `MATCH (a:Memory {userId: $userId})-[r:RELATES_TO]->(b:Memory) RETURN a.id, b.id, r.reason`

---

## Phase 2D: Frontend — Enhanced Topic Trail

### Step 10: Update Topic Trail UI

**File**: `apps/web/app/(main)/memories/timeline/_components/TimelineView.tsx`

- Timeline events from edge-connected memories get a subtle visual indicator (e.g., a "via connection" badge or different left-border color)
- `connectionType: "tag"` → normal styling
- `connectionType: "related"` → secondary color border + "Connected via: [reason]" label

---

## Edge Cases

- **Self-linking**: Prevent memory linking to itself (validate in `linkMemories()`)
- **Duplicate edges**: Use MERGE instead of CREATE for RELATES_TO to prevent duplicates
- **Deleted memories**: RELATES_TO edges get cleaned up via DETACH DELETE (already the behavior)
- **Graph performance**: `getAllRelationships()` could be large — add limit param, default 500
- **Drag-to-link UX**: Need clear visual feedback (cursor change, line preview, drop target highlight)

## Verification

1. Create 3 memories from same source within 15 min → verify RELATES_TO edges auto-created in Neo4j
2. Create memory from different source → verify no auto-link to previous memories
3. Open memory detail panel → see "Related Memories" section with auto-linked memories
4. Click "Link memory" → search and link a new memory → verify edge created
5. Click "Unlink" → verify edge removed
6. Open graph view → verify RELATES_TO edges render as dashed lines
7. Drag from one node to another → verify link created
8. Open Topic Trail for a tag → verify edge-connected memories appear with "Connected via" badge
9. Run `npx tsc` in both `apps/api` and `apps/web` — no type errors
