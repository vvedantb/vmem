# Plan — Connector-aware node rendering

## Context

Memory graph currently renders every node as an identically-styled circle whose fill is a hash of the first tag. That colour is the only signal — it accidentally clusters topic families but conveys nothing about provenance. Now that Gmail / Google Drive / Notion connectors write memories into the graph alongside MCP/manual ones, the user can't tell at a glance where a memory came from.

Goal: keep the tag-hash colour (topic signal) but overlay the connector's logo inside the circle so provenance becomes a second, independent visual signal. Non-connector nodes stay unchanged.

## What currently exists

- **Colours:** `apps/web/components/_components/graph-colors.ts:34` — first-tag → HSL. No source encoding.
- **Renderer:** `apps/web/components/_components/canvas/renderer.ts:224-268` — Canvas2D, circles batched by colour.
- **Backend already stores source:** `packages/backend/src/neo4j/memoryService.ts:345-388` writes `source`, `sourceType`, `sourceId`, `sourceUrl` on Memory nodes. `sourceType ∈ { google_drive, notion, gmail }` per `packages/backend/convex/schema.ts:52-54`.
- **Graph API does NOT expose sourceType:** `packages/backend/convex/graphApi.ts:5-20` and `packages/backend/convex/neo4jActions/graph.ts:21-49` return `{id,title,content,tags,createdAt}` only. `MemoryService.getGraphData` / `getLocalGraph` need to project `sourceType` too.

## Design decisions (confirmed)

1. **Logo inside circle** — circle keeps tag-hash fill, logo drawn centred on top.
2. **Colour stays tag-based** — no change to `graph-colors.ts`.
3. **Scope:** Gmail, Google Drive, Notion. Non-connector nodes (mcp / manual / web / no source) render as today — plain circle, no logo.

## Changes

### 1. Backend — expose `sourceType` on graph nodes

`packages/backend/src/neo4j/memoryService.ts`

- `getGraphData` + `getLocalGraph` Cypher: return `m.sourceType AS sourceType` alongside existing fields. Map to `sourceType: record.get("sourceType") ?? null` in the TS mapper.

`packages/backend/convex/neo4jActions/graph.ts:22-36`

- Extend `capGraph` node type + return type: `sourceType: string | null`.

`packages/backend/convex/graphApi.ts:5-20`

- Extend `GraphResult.nodes` with `sourceType: string | null`.

### 2. Frontend types — plumb `sourceType` through

`apps/web/hooks/useGraphData.ts:21-27`

- Zod `graphNodeSchema`: add `sourceType: z.string().nullable()`.

`apps/web/components/_components/graph-data.ts:9-15`

- `ApiGraphNode`: add `sourceType: string | null`.
- `buildGraphData` (line 85-96): copy `sourceType` onto each `GraphNode`.

`apps/web/components/_components/canvas/types.ts:3-11`

- `GraphNode`: add `sourceType: string | null`.

### 3. Logo assets

New files:

- `apps/web/public/connector-logos/gmail.svg`
- `apps/web/public/connector-logos/google_drive.svg`
- `apps/web/public/connector-logos/notion.svg`

Use official-brand SVGs (monochrome-tinted variants look best on coloured circles — we'll use full-colour for brand recognition, keep background circle opacity high enough for contrast).

### 4. Logo loading — new module

New file: `apps/web/components/_components/canvas/connector-logos.ts`

- Export `CONNECTOR_SOURCE_TYPES = ["gmail","google_drive","notion"] as const` + derived type.
- Export `loadConnectorLogos(): Promise<Map<string, HTMLImageElement>>` — creates `Image` per sourceType, resolves when all `onload` fire. Cached at module level so it runs once.
- Export `getConnectorLogo(sourceType: string | null, logoMap): HTMLImageElement | null`.

### 5. Renderer — draw logo inside circle

`apps/web/components/_components/canvas/renderer.ts`

- Add `logoMap: Map<string, HTMLImageElement>` parameter to `render()`.
- After the batched circle pass (line 268), add a new pass: for each visible, non-dimmed node with a resolvable logo:
  - Skip if `lowZoom` or `highNodeCount` (perf).
  - `ctx.save()` → clip to circle path → `ctx.drawImage(logo, nx - r*0.7, ny - r*0.7, r*1.4, r*1.4)` → `ctx.restore()`. Sizing keeps logo inside the circle with slight inset.
  - Respect dim-alpha like outline pass does.

`apps/web/components/_components/GraphCanvas.tsx`

- On mount: `useEffect` that calls `loadConnectorLogos()` and stores the map in a ref. Re-render once loaded.
- Pass the ref's map into the `render()` call. If map not yet loaded, pass an empty `Map` — nodes render as circles without logos, no layout shift.

### 6. Legend (small, optional-to-cut)

Check for existing legend (`Grep` `legend|Legend` in `apps/web/components`). If one exists (e.g. next to tag filter), extend with a "Sources" row listing the three connector logos + labels. If none exists, skip — the logos are self-explanatory.

## Critical files to modify

- `packages/backend/src/neo4j/memoryService.ts` — extend graph Cypher + TS mapper
- `packages/backend/convex/neo4jActions/graph.ts` — extend `capGraph` type
- `packages/backend/convex/graphApi.ts` — extend `GraphResult`
- `apps/web/hooks/useGraphData.ts` — extend Zod schema
- `apps/web/components/_components/graph-data.ts` — extend `ApiGraphNode` + mapper
- `apps/web/components/_components/canvas/types.ts` — extend `GraphNode`
- `apps/web/components/_components/canvas/connector-logos.ts` — NEW, logo registry + loader
- `apps/web/components/_components/canvas/renderer.ts` — new logo draw pass
- `apps/web/components/_components/GraphCanvas.tsx` — preload + pass logo map
- `apps/web/public/connector-logos/{gmail,google_drive,notion}.svg` — NEW assets

## Reuse / patterns followed

- Logos are drawn _after_ the colour-batched circle pass so batching perf is untouched for the common case (most nodes have no logo).
- Zoom/dim/search filtering reuses the same predicates already computed in the circles + outline passes — no new visibility logic.
- Clip-to-circle matches the circular node shape exactly, so logos never bleed outside.

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — types compile.
2. `cd apps/web && npx tsc --noEmit` — frontend types compile.
3. Visual test (user): open dashboard, confirm:
   - Connector-sourced nodes show their logo inside the coloured circle.
   - Non-connector nodes still render as plain circles.
   - Logos disappear at very low zoom (check perf doesn't regress on 2000-node graphs).
   - Hover / search dimming still works on logo'd nodes.
4. Seed a few memories per connector via existing connector sync flow and re-open the graph.

## Open questions

- **Logo contrast:** full-colour brand logos (e.g. Gmail red) on an already-coloured circle can clash when the tag-hash colour happens to be red-adjacent. Acceptable MVP? Alternative: white disc behind logo (slight circle-inside-circle ring). Flag during visual test.
- **Legend:** include a small source-legend, or rely on logo familiarity alone?
