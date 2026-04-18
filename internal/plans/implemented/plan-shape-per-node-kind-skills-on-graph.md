# Plan: Shape per Node Kind + Skills on Graph

## Context

Main MemoryGraph canvas currently draws every node as a circle, even though `GraphNodeKind = "memory" | "wiki-document" | "wiki-folder"` already flows end-to-end (API → hook → `buildGraphData` → `GraphNode.kind`), and the filter sidebar (`GraphKindFilter`) already displays a shape indicator per kind. The actual Canvas renderer at `apps/web/components/_components/canvas/renderer.ts` ignores `node.kind` and always calls `ctx.arc(...)`. The comment at `canvas/types.ts:4-9` literally names the intended mapping (circle/diamond/square) — never implemented.

User asks for shape-per-kind on the canvas and to add a new `skill` kind so skills (Convex `skills` table — currently only used by Skills page + MCP) show up as nodes:

- memory → circle (unchanged)
- wiki-document → diamond
- wiki-folder → square
- skill → hexagon (new kind)

Legend lives inside the existing Types filter in the left drawer (`GraphKindFilter`) — add a "Skills" row with a hexagon indicator.

## Approach

Two threads of work:

**A. Add `skill` as a 4th `GraphNodeKind`** — thread through backend → zod → union → filter → default-active set.
**B. Replace hardcoded `ctx.arc` with shape dispatch** in the renderer's node-fill and outline passes. Glow, focus-ring and link-target rings stay circular (halo around any shape — visually fine).

Physics untouched: `forceCollide` radius `node.size * 2` already approximates a circumscribed circle, works for every shape.

## Files to modify

### Backend

**`packages/backend/convex/graphApi.ts`**

- Extend `GraphNodeEntry.kind` union with `"skill"`.
- After wiki fetch (skip when `args.focus` is set — same rule as wiki), call `internal.skills.listByClerkIdInternal` (already exists — no new query needed).
- Map each skill to `GraphNodeEntry`: `id: \`skill:${\_id}\``, `title: name`, `content: description`, `tags: []`, `createdAt: new Date(\_createdAt).toISOString()`, `kind: "skill"`.
- Concat into `nodes` alongside memory + wiki nodes. No edges for skills (isolated nodes — matches wiki's no-cross-edge behaviour).

### Web

**`apps/web/hooks/useGraphData.ts`**

- `graphNodeKindSchema`: add `"skill"` to the `z.enum`.

**`apps/web/components/_components/canvas/types.ts`**

- `GraphNodeKind`: add `"skill"`.
- Update the 4-line shape-mapping comment to include `skill → hexagon`.

**`apps/web/components/_components/graph-data.ts`**

- `KIND_ORDER`: append `"skill"` (so the filter row ordering is stable).
- In `buildGraphData` node map (line 136): after the degree-based `size` calc, override for skills — `size: node.kind === "skill" ? 4 : Math.min(3 + degree * 0.6, 6)` — so skills render slightly larger than a degree-0 memory and read as distinct atoms.

**`apps/web/components/_components/graph-colors.ts`**

- `wikiKindColor` already handles `wiki-*`. Rename to `kindColor` and add a `skill` branch: hue **285** (purple), same S/L math as existing kind colors so it reads coherently in both themes.
- `nodeColor`: change the `if (kind !== "memory")` branch to call `kindColor(kind, isDarkCanvas)` for every non-memory kind.

**`apps/web/components/_components/canvas/renderer.ts`** — the real work:

- Add private helper `addShapePath(ctx, kind, x, y, r)` at top of file:
  - `memory`: `ctx.moveTo(x+r, y); ctx.arc(x, y, r, 0, TWO_PI)`
  - `wiki-folder`: `ctx.rect(x-r, y-r, 2*r, 2*r)`
  - `wiki-document`: diamond — `moveTo(x, y-r); lineTo(x+r, y); lineTo(x, y+r); lineTo(x-r, y); closePath()`
  - `skill`: regular flat-topped hexagon — loop `i=0..5` over `angle = Math.PI/3 * i`, `moveTo` first vertex then `lineTo` rest, `closePath()`
- Node-fill pass (lines 224–268): change the bucket key from `color` to `` `${color}|${kind}` `` (Map<string, {color, kind, nodes}>). One `beginPath`/`fill` per bucket; batching preserved, just O(uniqueColors × 4) instead of O(uniqueColors).
- Outline pass (lines 271–306): replace `ctx.arc(...)` at line 303 with `addShapePath(ctx, node.kind, nx, ny, baseRadius + outlineWidth)`.
- Glow pass (181–222), focus ring (308–326), link target ring (420–429): leave as `ctx.arc` — a circular halo/ring wrapping any inner shape reads cleanly and keeps the hot path unchanged.

**`apps/web/components/_components/GraphKindFilter.tsx`**

- `KIND_LABELS`: add `skill: "Skills"`.
- `ShapeIndicator`: replace the `shape` ternary with a switch. For skill use inline `style={{ clipPath: "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)" }}`. For `wiki-folder` explicitly keep it as a bare `<span>` (square). Diamond unchanged (rotate-45).

**`apps/web/components/MemoryGraph.tsx`**

- `DEFAULT_ACTIVE_KINDS`: add `"skill"` so new skills show up by default.

## Key files referenced

- `packages/backend/convex/graphApi.ts` (action that assembles the unified node list)
- `packages/backend/convex/skills.ts` — **reuse** `listByClerkIdInternal` (lines 143–158). No new backend fn.
- `apps/web/components/_components/canvas/renderer.ts` (hot-path renderer — the circle-only bug)
- `apps/web/components/_components/GraphKindFilter.tsx` (legend lives here)
- `apps/web/components/_components/canvas/types.ts` + `graph-data.ts` (kind union + ordering)
- `apps/web/hooks/useGraphData.ts` (zod validator)

Do **not** touch `CodebaseGraph.tsx` — it's a separate graph view over `:CodeFile` nodes, not in scope.

## Verification

1. Backend types: `cd packages/backend && npx convex codegen --typecheck enable` — no errors.
2. Web types: `cd apps/web && npx tsc --noEmit` — no errors (user runs when they say).
3. Visual test (primary): open dashboard → Graph tab.
   - Existing memories still circles.
   - Any wiki documents → diamonds; wiki folders → squares.
   - Create a skill on the Skills page → reload graph → skill appears as hexagon.
   - Left drawer Types filter shows 4 rows (Memories / Wiki docs / Folders / Skills) each with matching shape indicator; toggling each kind hides/shows that shape.
   - Hover + outline pass on each shape — outline follows the shape, not a circle.
   - Drag to link still works from any shape (link source + target ring stay circular — by design).
4. Focus mode: click a memory → focus graph — skills and wiki nodes excluded (unchanged: focus path already skips non-memory sources).

## Ship

5. Once visual verification passes, run the `/ship` skill to stage the relevant files, commit with a conventional-commit message, and push to the remote.
