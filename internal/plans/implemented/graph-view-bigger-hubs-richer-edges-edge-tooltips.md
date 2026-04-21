# Graph View: bigger hubs, richer edges, edge tooltips

## Context

Graph view already renders edges, but tag edges at alpha `0.12` read as invisible — user thought edges weren't there. Also node-size formula caps at degree 5 (`3 + degree * 0.6`, cap 6), hiding super-hubs. Goal: make connections visible, size nodes by connection count (multiplier form), and let users read relationship reasons by hovering edges.

Locked decisions (from Q&A):

- Size: `3 * (1 + degree * 0.05)`, **uncapped**. Skill degree-0 stays at 4 min.
- Edges: more visible + color-coded by type + hover tooltip with reason.
- Out: thickness-by-weight, mini-map, always-visible reason chips.

## Changes

### 1. Size formula — `apps/web/src/components/_components/graph-data.ts` (~line 155)

```ts
const scaled = 3 * (1 + degree * 0.05);
const size = node.kind === "skill" ? Math.max(4, scaled) : scaled;
```

### 2. Clamp collision + glow (super-hub safety)

Uncapped `size` breaks physics + fill-rate on hubs. Clamp in both sims and renderer:

- `apps/web/src/components/_components/canvas/simulation.ts:208` — `.radius((d) => Math.min(d.size, 12) * 2 + 1)`
- `apps/web/src/components/_components/canvas/simulation-worker.ts` — same change, keep in sync
- `apps/web/src/components/_components/canvas/renderer.ts` glow pass (~line 283) — `const glowR = Math.min(node.size, 10) * 2 * theme.glow.radiusMultiplier`

Node visual size stays uncapped; only physics + glow fill-rate protected.

### 3. Per-type edge colors — `apps/web/src/components/_components/graph-view-themes.ts`

Replace `edge.normal: string` with `edge.normalByType: { tag, relates_to, wiki_parent }`. `imports` reuses `relates_to`. Keep `connected`/`dimmed`/`width`/`connectedWidth` unchanged.

Palette (bumped alphas across all 7 themes; tag = ambient cool, relates_to = warm user-forged, wiki_parent = structural cool):

| Theme         | tag                      | relates_to               | wiki_parent              |
| ------------- | ------------------------ | ------------------------ | ------------------------ |
| DEFAULT_DARK  | `rgba(180,180,200,0.18)` | `rgba(255,170,110,0.55)` | `rgba(130,170,255,0.5)`  |
| DEFAULT_LIGHT | `rgba(60,70,90,0.22)`    | `rgba(200,90,30,0.65)`   | `rgba(60,100,200,0.55)`  |
| SATELLITE     | `rgba(160,150,200,0.12)` | `rgba(255,180,120,0.55)` | `rgba(140,200,255,0.5)`  |
| CONSTELLATION | `rgba(140,180,255,0.45)` | `rgba(255,200,140,0.85)` | `rgba(180,220,255,0.75)` |
| BLUEPRINT     | `#a8b8cc`                | `#c67b3f`                | `#4a6b9a`                |
| MINIMAL_DARK  | `rgba(255,255,255,0.07)` | `rgba(230,180,130,0.4)`  | `rgba(160,190,230,0.35)` |
| MINIMAL_LIGHT | `rgba(0,0,0,0.1)`        | `rgba(150,80,30,0.5)`    | `rgba(40,70,130,0.4)`    |

Also bump base `theme.edge.width` ~25% on DEFAULT_DARK (`0.6 → 0.8`) and SATELLITE (`0.4 → 0.55`) for extra visibility.

### 4. Renderer — `apps/web/src/components/_components/canvas/renderer.ts` (lines 185–275)

- Split no-hover branch into 3 batched passes (tag / relates_to+imports / wiki_parent), each stroking with `theme.edge.normalByType[type]`.
- Hover branch: per-type dimmed pass uses `theme.edge.normalByType[type]` faded; connected pass keeps `theme.edge.connected` (single hue = "lit up" signal).
- **New: hovered-edge pass** — after normal edges, if `interaction.hoveredEdgeIndex !== null` re-stroke that one edge at `connectedWidth * 1.8` in `theme.edge.connected`. Gives tooltip a clear anchor.
- Edge category label chips: keep as-is (user didn't ask to remove).

### 5. Edge hit-testing — `apps/web/src/components/_components/canvas/hit-test.ts`

Add naive O(E) scan (≤4000 edges, ~<0.1ms/frame, no spatial index needed):

```ts
export function getEdgeAt(
  edges: ResolvedEdge[],
  worldX: number,
  worldY: number,
  scale: number,
): number | null {
  const threshold = 6 / Math.min(scale, 1);
  const thrSq = threshold * threshold;
  let bestIdx = -1,
    bestDSq = thrSq;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const x1 = e.source.x ?? 0,
      y1 = e.source.y ?? 0;
    const x2 = e.target.x ?? 0,
      y2 = e.target.y ?? 0;
    const dx = x2 - x1,
      dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((worldX - x1) * dx + (worldY - y1) * dy) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + t * dx,
      py = y1 + t * dy;
    const dSq = (worldX - px) ** 2 + (worldY - py) ** 2;
    if (dSq < bestDSq) {
      bestDSq = dSq;
      bestIdx = i;
    }
  }
  return bestIdx === -1 ? null : bestIdx;
}
```

### 6. Types — `apps/web/src/components/_components/canvas/types.ts`

Add to `InteractionState`: `hoveredEdgeIndex: number | null;`

### 7. Input handler — `apps/web/src/components/_components/canvas/input-handler.ts`

- Add `onHoverEdge: (idx: number | null) => void` to `Callbacks`.
- Pass `edgesRef: { current: ResolvedEdge[] }` as new param.
- Inside `onMouseMove` hover branch (lines 134–146): run `getNodeAt` first. If node hit → clear edge hover, notify node. Else run `getEdgeAt`, update `interaction.hoveredEdgeIndex`, notify edge.
- **Precedence enforced here** — node always wins.

### 8. GraphCanvas — `apps/web/src/components/_components/GraphCanvas.tsx`

- New prop: `onHoverEdge?: (info: HoveredEdgeInfo | null) => void`.
- `edgesRef = useRef(resolvedEdges)` kept fresh via effect on edges prop.
- Reset `hoveredEdgeIndex` to `null` when edges array reference changes (stale idx).
- In hover callback, resolve idx → edge → compute screen coords via existing `worldToScreen` → build `HoveredEdgeInfo`.

### 9. HoveredEdgeInfo type — `apps/web/src/components/_components/graph-types.ts`

```ts
export interface HoveredEdgeInfo {
  edgeType: GraphEdgeType;
  sourceTitle: string;
  targetTitle: string;
  reason: string | null; // tag: sharedTags joined; relates_to: API reason; wiki_parent: null
  viewportX: number;
  viewportY: number;
}
```

### 10. New `GraphEdgeTooltip.tsx` — `apps/web/src/components/_components/GraphEdgeTooltip.tsx`

Mirror `GraphNodeTooltip.tsx` layout (glass-panel, same offset/clamping). Content:

```tsx
<p className="font-medium text-foreground text-xs mb-1">
  {sourceTitle} ↔ {targetTitle}
</p>
<p className="text-xs text-muted-foreground">
  {label(edgeType)}{reason ? ` · ${reason}` : ""}
</p>
```

Labels: `tag → "Shared tags"`, `relates_to → "Related"`, `wiki_parent → "Parent folder"`, `imports → "Imports"`.

### 11. Orchestrator — `apps/web/src/components/MemoryGraph.tsx`

- `const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);`
- Pass `onHoverEdge={setHoveredEdge}` to `GraphCanvas`.
- Render `{hoveredEdge && !selectedNodeId && !hoveredNode && <GraphEdgeTooltip {...hoveredEdge} />}`.

Tag `reason` field already populated in `graph-data.ts:180` (`edge.sharedTags.join(", ")`). `relates_to.reason` comes from API. `wiki_parent` has no reason — null.

## Critical files

- `apps/web/src/components/_components/graph-data.ts` — size formula
- `apps/web/src/components/_components/graph-view-themes.ts` — per-type color schema
- `apps/web/src/components/_components/canvas/types.ts` — InteractionState extension
- `apps/web/src/components/_components/canvas/renderer.ts` — per-type passes + hovered edge pass
- `apps/web/src/components/_components/canvas/hit-test.ts` — `getEdgeAt`
- `apps/web/src/components/_components/canvas/input-handler.ts` — edge hover wiring
- `apps/web/src/components/_components/canvas/simulation.ts` + `simulation-worker.ts` — collision clamp
- `apps/web/src/components/_components/GraphCanvas.tsx` — onHoverEdge plumbing
- `apps/web/src/components/_components/GraphEdgeTooltip.tsx` — NEW
- `apps/web/src/components/_components/graph-types.ts` — `HoveredEdgeInfo`
- `apps/web/src/components/MemoryGraph.tsx` — state + render tooltip

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — confirm no backend break (shouldn't, backend untouched).
2. `cd apps/web && npx tsc --noEmit` — confirm type changes compile.
3. Visual test on `/memories?view=graph`:
   - Create a memory with 10+ tag overlaps → node visibly larger than degree-0 nodes.
   - Tag edges visible (not ghost-alpha) in Default Dark.
   - Hover an edge → tooltip shows source ↔ target + reason.
   - Hover a node that has edges → node wins precedence, edge tooltip hidden.
   - Switch through all 5 view modes → each renders tag/relates_to/wiki_parent in distinct hues.
4. Create a user-linked relation (shift+drag) → edge appears in warm hue (relates_to).
5. Large profile stress: scroll through a profile with 500+ nodes, ensure frame rate stays smooth (collision/glow clamps protect super-hubs).

## Open questions

None — all decisions locked via Q&A.
