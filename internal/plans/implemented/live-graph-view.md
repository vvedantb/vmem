# Live Graph View via Convex Event Bus

## Context

Graph view fetches memories once on mount via REST (Hono → Neo4j). No real-time updates — new nodes only appear on page refresh. Goal: make graph live so nodes/edges appear/update/disappear in real-time as memories change, using Convex as a lightweight event bus between the Hono API and the frontend. Also migrating REST data fetching to TanStack Query.

## Architecture

```
Hono API (memory CRUD)
  → ConvexHttpClient.mutation(pushEvent) [fire-and-forget]
  → Convex memoryEvents table [event bus, auto-cleanup]
  → Frontend Convex useQuery(getRecentEvents) [live subscription]
  → queryClient.invalidateQueries(["memories"]) [trigger TanStack refetch]
  → MemoryContext (TanStack Query) [automatic cache update]
  → MemoryGraph incremental diff [preserve positions, animate new nodes]
  → ForceGraph canvas [render opacity for fade-in/out]
```

---

## Step 1: Install TanStack Query + Set Up Provider

**File:** `apps/web/package.json` — add `@tanstack/react-query`

**File:** `apps/web/components/providers/QueryProvider.tsx` (new)

- Create `QueryClientProvider` wrapper with sensible defaults
- `staleTime: 30_000` (30s), `refetchOnWindowFocus: true`

**File:** `apps/web/app/layout.tsx` (or wherever providers are composed)

- Wrap app with `QueryProvider`

## Step 2: Convex Schema Changes

**File:** `packages/backend/convex/schema.ts`

- Remove unused `memories` table (Neo4j is source of truth)
- Add `memoryEvents` table:
  - `clerkId: v.string()` — Clerk user ID (not Convex Id, since Hono uses Clerk IDs)
  - `eventType: v.union(v.literal("memory_created"), v.literal("memory_updated"), v.literal("memory_deleted"), v.literal("relationship_created"), v.literal("relationship_deleted"))`
  - `memoryId: v.string()` — Neo4j memory ID
  - `payload: v.string()` — JSON-stringified event data (varies per type)
  - Index: `by_clerk_created` on `["clerkId", "_creationTime"]`

## Step 3: Convex Functions

**File:** `packages/backend/convex/memoryEvents.ts` (new)

**`pushEvent`** — mutation (no auth, validated by shared secret)

- Args: `{ secret, clerkId, eventType, memoryId, payload }`
- Validates `secret === process.env.CONVEX_EVENT_SECRET`
- Inserts event
- Inline cleanup: delete events older than 5 min for this user

**`getRecentEvents`** — query (auth via Clerk identity)

- Args: `{ since: v.number() }` (timestamp)
- Gets `identity.subject` (Clerk ID) from `ctx.auth.getUserIdentity()`
- Returns events where `_creationTime > since`, ordered ascending
- Uses `by_clerk_created` index

## Step 4: Hono → Convex Client

**File:** `apps/api/src/lib/convex.ts` (new)

- Create `ConvexHttpClient` singleton from `CONVEX_URL` env var
- Export `pushMemoryEvent(clerkId, eventType, memoryId, payload)` helper
- Fire-and-forget (catch errors, don't block API response)
- Reads `CONVEX_EVENT_SECRET` from env

**File:** `apps/api/package.json` — add `convex` dependency

## Step 5: Fire Events from Hono Routes

**File:** `apps/api/src/routes/memories.ts`

After each successful operation, call `pushMemoryEvent`:

- `POST /` → `memory_created` with `{ id, title, content, tags, createdAt }`
- `PATCH /:id` → `memory_updated` with `{ id, title, content, tags }`
- `DELETE /:id` → `memory_deleted` with `{ id }`

**File:** `apps/api/src/routes/relationships.ts`

- `POST /link` → `relationship_created` with `{ source, target, reason }`
- `DELETE /link` or unlink → `relationship_deleted` with `{ source, target }`

## Step 6: Migrate MemoryContext to TanStack Query

**File:** `apps/web/components/contexts/MemoryContext.tsx`

Replace raw `fetch + useState` with TanStack Query:

- `useQuery({ queryKey: ["memories"], queryFn: fetchMemories })` for listing
- `useMutation` for create/update/delete with optimistic updates via `onMutate`/`onSettled`
- Remove manual `useState` for memories and `isLoading`
- TanStack handles: loading state, error state, refetch-on-focus, deduplication
- Keep `authFetch` helper for authenticated requests
- Expose same `MemoryContextType` interface (memories, isLoading, createMemory, updateMemory, deleteMemory, refreshMemories)

## Step 7: Frontend Event Hook

**File:** `apps/web/hooks/useMemoryEvents.ts` (new)

```
useMemoryEvents()
```

- Stores `since` as state, initialized to `Date.now()` on mount
- Convex `useQuery(api.memoryEvents.getRecentEvents, { since })`
- Tracks processed event IDs in a Set (ref) to avoid duplicates
- When new unprocessed events arrive:
  - Memory events → `queryClient.invalidateQueries({ queryKey: ["memories"] })` (TanStack refetches automatically)
  - Relationship events → call a provided `onRelationshipEvent` callback
- Advances `since` periodically (every 30s) to keep query window small

## Step 8: Wire Events into MemoryContext

**File:** `apps/web/components/contexts/MemoryContext.tsx`

- Use `useMemoryEvents` hook inside the provider
- Memory events: TanStack Query handles the refetch via `invalidateQueries` — no manual state updates needed
- Relationship events: expose via context so MemoryGraph can subscribe
- Refetch-on-focus already handled by TanStack Query (no manual `visibilitychange`)

## Step 7: Graph Types — Add `opacity`

**File:** `apps/web/components/_components/graph-types.ts`

Add `opacity: number` to `SimNode` (0–1, default 1). Used for fade-in/out animations.

## Step 8: MemoryGraph — Position-Preserving Rebuild

**File:** `apps/web/components/MemoryGraph.tsx`

Current `useMemo` (lines 109-210) creates all nodes with random positions every time `memories` changes. Change to:

- Keep a `prevNodesRef` storing the last computed nodes (by ID → {x, y, vx, vy})
- In useMemo: for existing nodes, copy position from prevNodesRef. For new nodes, set `opacity: 0` and position near a related existing node (shared tag) or center
- For deleted nodes (in prev but not in new memories): don't include in nodes array — instead mark them in a `fadingOutRef` with decreasing opacity (handled in ForceGraph render loop)
- After useMemo, update prevNodesRef

**ForceGraph useEffect (line 264-272):** Only run `createLayoutGraph`/`runInitialLayout` on first load (when prevNodesRef was empty). Skip for incremental updates — existing physics handles positioning.

## Step 9: ForceGraph — Render Opacity

**File:** `apps/web/components/_components/ForceGraph.tsx`

In `graph-physics.ts` `renderGraph()`:

- Before drawing each node, set `ctx.globalAlpha = node.opacity`
- Edges connected to fading nodes also get reduced opacity

In the animation loop:

- For nodes with `opacity < 1`: increment by ~0.03/frame (fade-in over ~0.5s at 60fps)
- Nodes are always in the array with their opacity — no separate "fading" structure needed

## Step 10: Relationship Live Updates in MemoryGraph

**File:** `apps/web/components/MemoryGraph.tsx`

- Subscribe to relationship events from MemoryContext
- On `relationship_created`: add to `relatesToEdges` state
- On `relationship_deleted`: remove from `relatesToEdges` state
- This triggers the useMemo to recompute edges (but position-preserving for nodes)

---

## Implementation Order

1. Install TanStack Query + provider setup (Step 1)
2. Convex schema + functions (Steps 2-3)
3. Hono Convex client + event firing (Steps 4-5)
4. Migrate MemoryContext to TanStack Query (Step 6)
5. graph-types opacity (Step 9)
6. ForceGraph opacity rendering (Step 11)
7. useMemoryEvents hook + wire into MemoryContext (Steps 7-8)
8. MemoryGraph position-preserving rebuild (Step 10)
9. Relationship live updates (Step 12)

## Verification

- Create a memory via the web UI → see it appear as a new node fading in on the graph (in another tab)
- Update a memory's title/tags → see the node update on the graph
- Delete a memory → see the node fade out
- Link two memories → see the edge appear
- Open two browser tabs side-by-side to confirm cross-tab reactivity
- Tab away and back → TanStack refetches on focus
- Check Convex dashboard to verify events are being created and cleaned up

## Dependencies to Add

- `@tanstack/react-query` in apps/web
- `convex` in apps/api

## Env Vars Needed

- `CONVEX_URL` in apps/api/.env (already exists in packages/backend)
- `CONVEX_EVENT_SECRET` in apps/api/.env AND as Convex env var
