# Graph Visualization — Graphology + Sigma.js Rewrite

## Goal

Replace the current hand-rolled Canvas 2D force simulation in `MemoryGraph.tsx` with Graphology (graph data model + layout) and Sigma.js (WebGL rendering). The current implementation has O(n²) force simulation on every frame, manual pan/zoom/hit-testing, and won't scale past ~100 nodes.

## Current State

- `apps/web/components/MemoryGraph.tsx` — 603 lines, hand-rolled Canvas 2D
- `apps/web/app/(main)/memories/graph/page.tsx` — thin wrapper
- Data source: `useMemoryContext()` → `memories: Memory[]` where Memory = `{ id, title, content, tags, createdAt }`
- Edges are computed client-side: two memories share an edge if they have overlapping tags, weight = shared tag count
- UI features: zoom in/out/reset buttons, hover tooltip, click → dialog with details + related memories
- Uses `@vmem/ui` components (Button, Badge, Dialog, Skeleton) and `@tabler/icons-react`
- Theme: reads CSS custom properties via `getComputedStyle` for oklch colors from ThemeContext

## Architecture

### Dependencies to Install

```bash
pnpm --filter @vmem/web add graphology sigma graphology-layout-forceatlas2 graphology-types
```

### Component Structure

```
components/
  MemoryGraph.tsx              → rewrite (orchestrator, <250 lines)
  _components/
    GraphRenderer.tsx           → Sigma container + camera controls (~150 lines)
    GraphNodeTooltip.tsx        → hover tooltip overlay (~30 lines)
    GraphNodeDetailDialog.tsx   → click detail dialog (extract from current) (~80 lines)
```

### Data Flow

1. `useMemoryContext()` provides `memories[]`
2. Build a `graphology.Graph` instance from memories:
   - Each memory → node with attributes: `{ label: title, content, tags, createdAt, size: 10, color: tagBasedColor }`
   - Each shared-tag pair → edge with attributes: `{ weight: sharedTagCount, color: edgeColor }`
   - Tag nodes optional (stretch): add Tag nodes and TAGGED_WITH edges for a true knowledge graph view
3. Run ForceAtlas2 layout (graphology-layout-forceatlas2) synchronously for initial positions, then optionally run it live for a few seconds
4. Pass the Graph instance to `<Sigma>` for WebGL rendering

### GraphRenderer.tsx

- Use `@react-sigma/core` if available, otherwise mount Sigma imperatively via useEffect + useRef on a container div
- Check if `@react-sigma/core` works with current React 19 — if not, use imperative approach:
  ```tsx
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const renderer = new Sigma(graph, containerRef.current, settings);
    renderer.on("enterNode", ({ node }) => onHoverNode(node));
    renderer.on("leaveNode", () => onHoverNode(null));
    renderer.on("clickNode", ({ node }) => onClickNode(node));
    return () => renderer.kill();
  }, [graph]);
  ```
- Sigma settings to configure:
  - `renderEdgeLabels: false`
  - `defaultNodeColor` / `defaultEdgeColor` from theme CSS vars
  - `labelFont: "system-ui, sans-serif"`
  - `labelSize: 12`
  - `labelRenderedSizeThreshold: 6` (hide labels when zoomed out)

### Camera Controls

- Keep the zoom in / zoom out / reset buttons from current UI
- Map them to `sigma.getCamera().animatedZoom()`, `animatedUnzoom()`, `animatedReset()`

### Theme Integration

- Read oklch colors from CSS custom properties same as current approach
- Map to hex/rgb for Sigma (Sigma uses hex colors)
- Convert oklch → hex helper function needed, or use the computed rgb values

### Hover Tooltip

- On Sigma `enterNode` event, get node attributes + screen coordinates via `sigma.graphToViewport()`
- Render an absolutely positioned div overlay (same as current glass-panel tooltip)
- On `leaveNode`, hide it

### Click Detail Dialog

- On Sigma `clickNode` event, get full node attributes
- Open the same Dialog component with memory details + related memories
- Related memories: use `graph.neighbors(nodeId)` instead of manual edge filtering

### Node Coloring Strategy

- Hash the first tag to a hue, or assign colors per tag cluster
- Alternatively: use a simple palette, assign by memory type or by connected component
- Nodes with more connections → larger size: `size: 5 + graph.degree(node) * 2`

### Performance Targets

- Should handle 1000+ nodes smoothly (Sigma WebGL)
- ForceAtlas2 layout: run for ~50 iterations synchronously on mount, then stop
- No requestAnimationFrame loops in React — Sigma handles its own render loop

## Migration Checklist

1. Install dependencies: graphology, sigma, graphology-layout-forceatlas2, graphology-types
2. Create `_components/GraphNodeTooltip.tsx` — hover overlay
3. Create `_components/GraphNodeDetailDialog.tsx` — extract dialog from current MemoryGraph
4. Create `_components/GraphRenderer.tsx` — Sigma mount + event wiring
5. Rewrite `MemoryGraph.tsx` — build Graph, run layout, compose child components
6. Delete all canvas/force-simulation/manual-pan-zoom code
7. Verify theme colors work in both light and dark mode
8. Test with 0 memories (empty state), 1 memory, 5 memories, 50+ memories

## Stretch Goals (not MVP)

- Tag nodes: render Tag as a different shaped/colored node, edges from Memory→Tag
- Cluster highlighting: hover a node highlights its connected subgraph, dims the rest
- Time-based filtering: slider to show memories from a date range
- Neo4j relationships: fetch actual graph relationships from API instead of computing client-side from tags
- Search within graph: highlight nodes matching a search query
- Minimap overlay

## Key Decisions

- **Imperative Sigma over @react-sigma/core**: React 19 compat unclear, imperative is simpler and more predictable
- **Synchronous ForceAtlas2**: faster initial render, no layout animation jitter
- **No D3**: Sigma WebGL >> D3 SVG for graph-specific viz at scale
- **Client-side edge computation for now**: matches current behavior, switch to API-served graph data later when Neo4j relationships are richer
