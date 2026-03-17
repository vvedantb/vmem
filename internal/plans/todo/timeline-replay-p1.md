# Timeline / Replay Page

## Context

Users need to understand HOW their knowledge evolved — trace a single memory's lifecycle (created → edited → pinned) and reconstruct decision trails across related memories. The graph DB makes this natural since MemoryEvent nodes already exist, but they lack content snapshots. This feature adds snapshots + a new timeline page with two modes.

## Decisions Made

- **UI**: Vertical timeline, two tab modes (Memory History / Topic Trail)
- **Snapshots**: Full content stored as JSON on each MemoryEvent node
- **Topic grouping**: Shared tags + time proximity (no RELATES_TO edges in V1)
- **Diff display**: `diff` npm package, word-level inline red/green highlighting
- **URL state**: nuqs (new dependency, needs NuqsAdapter in root layout)
- **Entry points**: Sidebar nav, "View history" on memory detail, tag click

---

## Phase 1: Backend — Snapshot Storage

### Step 1: Update `logEvent()` signature + Cypher

**File**: `apps/api/src/db/memory-service.ts` (line 755)

- Add `snapshot` param to `logEvent()` — JSON string of `{ title, content, type, status, confidence, tags }`
- Store `snapshot: $snapshot` on the MemoryEvent CREATE Cypher

### Step 2: Pass snapshots from create/update

**File**: `apps/api/src/db/memory-service.ts`

- `createMemory()` (line 134): Build snapshot from `params` + `status: 'active'`, pass to `logEvent()`
- `updateMemory()` (line 299): Build snapshot from the returned memory record, pass to `logEvent()`
- `resolveProposal()` (approve path): Build snapshot from post-approval state, add `logEvent()` call

### Step 3: New timeline query methods

**File**: `apps/api/src/db/memory-service.ts`

3 new methods:

- `getMemoryTimeline(userId, memoryId)` — All events for one memory, ordered ASC, with parsed snapshots
- `getTopicTimeline(userId, tag, limit, offset)` — MATCH memories by tag → collect their events → flat list ordered by createdAt ASC, each event annotated with parent memory id/title
- `getSearchTimeline(userId, query, limit, offset)` — Fulltext search on `memory_content` index → collect events → same flat structure

### Step 4: New timeline route

**New file**: `apps/api/src/routes/timeline.ts`

Follow `dashboard.ts` pattern. 3 endpoints:

- `GET /memory/:id` → `getMemoryTimeline()`
- `GET /topic?tag=X&limit=50&offset=0` → `getTopicTimeline()`
- `GET /search?q=X&limit=50&offset=0` → `getSearchTimeline()`

### Step 5: Register route

**File**: `apps/api/src/index.ts`

- Import timeline route
- `app.use("/timeline/*", authMiddleware)`
- `app.route("/timeline", timeline)`

---

## Phase 2: Frontend — Dependencies + Types

### Step 6: Install deps

- `pnpm add nuqs` in `apps/web/`
- `pnpm add diff @types/diff` in `apps/web/`

### Step 7: NuqsAdapter in root layout

**File**: `apps/web/app/layout.tsx`

Wrap `<ClientProvider>` children with `<NuqsAdapter>` from `nuqs/adapters/next/app`

### Step 8: Timeline types

**New file**: `apps/web/lib/timeline.ts`

Types: `MemorySnapshot`, `TimelineEvent` (id, action, actor, createdAt, snapshot, memoryId, memoryTitle), `TimelineMode`

### Step 9: URL state parsers

**New file**: `apps/web/app/(main)/memories/timeline/searchParams.ts`

nuqs parsers: `mode` (history | trail), `memoryId`, `tag`, `query`

---

## Phase 3: Frontend — Timeline Page

### Step 10: Server page

**New file**: `apps/web/app/(main)/memories/timeline/page.tsx`

Server Component, renders `<Suspense>` → `<TimelineClient />`

### Step 11: Client orchestrator

**New file**: `apps/web/app/(main)/memories/timeline/TimelineClient.tsx`

- `"use client"`, uses `useQueryStates` from nuqs
- Two tabs: Memory History / Topic Trail
- Memory History: memory selector → fetch `/v1/timeline/memory/:id`
- Topic Trail: tag selector + search → fetch `/v1/timeline/topic?tag=X` or `/v1/timeline/search?q=X`
- Delegates rendering to `<TimelineView />`
- Max ~250 lines

### Step 12: TimelineView

**New file**: `apps/web/app/(main)/memories/timeline/_components/TimelineView.tsx`

- Vertical timeline: left-border + circle pattern
- Each event: timestamp, action badge, actor
- History mode: inline diff between consecutive snapshots via `<DiffDisplay />`
- Trail mode: memory title + content preview + tags

### Step 13: DiffDisplay

**New file**: `apps/web/app/(main)/memories/timeline/_components/DiffDisplay.tsx`

- Takes `oldText` and `newText`
- `diffWords()` from `diff` package
- Red bg + line-through for removals, green bg for additions
- First event (no previous): show full content, no diff

### Step 14: MemorySelector

**New file**: `apps/web/app/(main)/memories/timeline/_components/MemorySelector.tsx`

- `"use client"`, uses MemoryContext for memory list
- Select/combobox from @vmem/ui
- Updates `memoryId` nuqs param on select

### Step 15: TagSelector

**New file**: `apps/web/app/(main)/memories/timeline/_components/TagSelector.tsx`

- `"use client"`, derives tags from MemoryContext
- Badge-based picker (reuse pattern from MemorySearch)
- Updates `tag` nuqs param on select

---

## Phase 4: Entry Points

### Step 16: Sidebar nav

**File**: `apps/web/components/sidebar/nav-config.ts`

Add to Workspace group after "Memory Graph":
`{ href: "/memories/timeline", label: "Timeline", icon: IconHistory }`

Import `IconHistory` from `@tabler/icons-react`

### Step 17: "View history" on memory detail

**File**: `apps/web/components/MemoryDetailPanel.tsx`

Add "History" button → `router.push(/memories/timeline?mode=history&memoryId=${memory.id})`

---

## Edge Cases

- **Old events without snapshots**: Frontend must handle `snapshot: null` — show "No snapshot available"
- **Deleted memories**: Hard-deleted, events orphaned. Timeline handles missing parent gracefully
- **Empty timeline**: Clean empty state (icon + "No events yet")
- **First event diff**: No previous snapshot to diff against → show full content

## Verification

1. Create a memory via the UI → check that MemoryEvent now has snapshot field in Neo4j
2. Update the memory → check second event has post-update snapshot
3. Navigate to `/memories/timeline` → select memory → see vertical timeline with diff
4. Switch to Topic Trail → select a tag → see related memories chronologically
5. Click "View history" on a memory detail panel → lands on timeline with memory pre-selected
6. Run `npx tsc` in both `apps/api` and `apps/web` — no type errors
