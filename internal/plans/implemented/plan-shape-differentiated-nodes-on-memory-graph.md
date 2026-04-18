# Plan: Shape-Differentiated Nodes on Memory Graph

## Context

Memory graph (`/memories?view=graph`) currently renders only Neo4j memory nodes, all as circles. Wiki content (Convex `wikiNodes` table with `kind: folder | document`) lives in a separate system and never appears on this graph. User wants a unified visualization with shape-based type differentiation so wiki content and memories coexist legibly:

- regular memories → circle (unchanged)
- wiki document → diamond
- wiki folder → square

This means merging wikiNodes into the graph data feed AND extending the canvas renderer to dispatch on node kind.

## Data Model Change

Add `kind` to `GraphNode` (`apps/web/components/_components/canvas/types.ts:3-11`):

```ts
kind: "memory" | "wiki-document" | "wiki-folder";
```

Add new edge array `wikiParentEdges` (folder → child) to the graph payload — distinct from `relatesToEdges`/`tagEdges` so styling can differ.

Namespace IDs to avoid Convex↔Neo4j collisions: `mem:${neo4jId}` and `wiki:${convexId}`.

## Backend

### `packages/backend/convex/graphApi.ts` (`getGraphData`, lines 22-38)

Extend the action. After calling `MemoryService.getGraphData()`:

1. `ctx.runQuery` a new Convex query `wikiApi.listForUser` returning all wikiNodes for current user.
2. Map each wikiNode → GraphNode-shaped record with `kind: "wiki-${kind}"`, namespaced id, `tags: []` (wikiNodes have no tags today).
3. Build `wikiParentEdges` from `parentId` field.
4. Return merged `{ nodes, relatesToEdges, tagEdges, wikiParentEdges }`.

Update return validator in same file.

### `packages/backend/convex/wikiApi.ts` (likely exists — verify)

Add or reuse `listForUser` query: `ctx.db.query("wikiNodes").withIndex("by_user", q => q.eq("userId", userId)).collect()`.

## Frontend

### `apps/web/components/_components/graph-data.ts` (`buildGraphData`, lines 56-137)

- Propagate `kind` onto each `GraphNode`
- Merge `wikiParentEdges` into the edge set used by simulation + renderer
- Namespace-aware ID resolution when edges reference nodes

### `apps/web/components/_components/graph-colors.ts` (`nodeColor`, lines 34-42)

Wiki nodes have no tags → extend `nodeColor(node)` to branch on `kind`:

- `wiki-folder` → muted tonal color (reuse existing palette's neutral slot)
- `wiki-document` → accent color
- `memory` → unchanged tag-based color

No new color tokens — reuse existing palette to stay consistent with design system.

### `apps/web/components/_components/canvas/renderer.ts` (lines 224-268)

Current loop batches by color and calls `ctx.arc`. Refactor:

1. Extract shape drawing to pure helpers in same file:
   - `drawCircle(ctx, x, y, r)` — existing arc
   - `drawSquare(ctx, x, y, r)` — axis-aligned rect sized to inscribe the same radius
   - `drawDiamond(ctx, x, y, r)` — 4-point path (square rotated 45°)

2. Replace the single-pass circle loop with batched passes keyed by `(color, kind)` — preserves current batching perf characteristic. ~1k node ceiling makes this trivial.

3. Keep existing selection ring / hover logic — it's radius-based, works for all three shapes.

### `apps/web/hooks/useGraphData.ts`

Update TypeScript types flowing from `getGraphData` to include `kind` and `wikiParentEdges`. Types should flow automatically from `FunctionReturnType<typeof api.graphApi.getGraphData>` — no manual interfaces.

### Wiki parent edge styling

Render `wikiParentEdges` in renderer with a distinct style (e.g., slightly thicker, same color family as wiki nodes). No separate arrowheads — matches existing edge minimalism.

## Critical Files

- `apps/web/components/_components/canvas/types.ts`
- `apps/web/components/_components/canvas/renderer.ts`
- `apps/web/components/_components/graph-data.ts`
- `apps/web/components/_components/graph-colors.ts`
- `apps/web/hooks/useGraphData.ts`
- `packages/backend/convex/graphApi.ts`
- `packages/backend/convex/wikiApi.ts` (add query if missing)
- `packages/backend/convex/validators.ts` (if return validator shared)

No changes to Neo4j schema. No changes to `MemoryService`. No changes to `packages/backend/convex/schema.ts`.

## Verification

1. Navigate to `/memories?view=graph` in browser (user does visual testing per CLAUDE.md)
2. Confirm three shapes render: circles (memories), diamonds (wiki docs), squares (wiki folders)
3. Confirm wiki folder→child edges draw correctly
4. Create a new wiki document via the wiki UI → appears on graph as diamond in real time (live Convex subscription)
5. Create a new memory → appears as circle, unchanged behaviour
6. Hover/selection rings still align with all shapes
7. `cd packages/backend && npx convex codegen --typecheck enable` — zero type errors

## Unresolved Questions

None — user confirmed scope (add wiki nodes) and mapping (circle / diamond / square).
