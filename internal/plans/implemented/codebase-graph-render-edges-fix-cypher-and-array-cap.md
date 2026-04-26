# Codebase Graph — Render Edges, Fix Cypher Variable, Cap Payload Size

## Context

`/codebases/:id` was unusable. Three bugs stacked on top of each other:

1. **Cypher variable mismatch — graph never loaded.** `getGraph` blew up with `Neo4jError: Variable 'rel' not defined`. Two snippet constants in `packages/backend/src/neo4j/codebase/read.ts` used `rel.X`, but every consuming `MATCH` bound the relationship as `[r:TYPE]`. Undefined variable at query time, action throws, dashboard shows the "Failed to load graph" empty state.
2. **Convex 8192 array cap — graph blew up after the Cypher fix.** Once the query started returning data, real codebases overflowed Convex's `Array length is too long (20446 > maximum length 8192)` action-return ceiling. `CALLS` edges alone are explosive on a monorepo.
3. **No edges visible — even after the payload landed.** The canvas renderer in `apps/web/src/components/_components/canvas/renderer.ts` only drew memory edge types (`tag`, `relates_to`, `wiki_parent`, `mentions`). Codebase types (`calls`, `imports`, `contains`, `has_method`, `extends`, `implements`, `starts_process`, `includes`) were defined in the type union but never painted, so every node looked isolated. The Cypher error masked this for weeks because the graph never loaded.

User also asked for parity with the memory graph: hover an edge → tooltip with edge label.

## Files

- `packages/backend/src/neo4j/codebase/read.ts` — Cypher variable rename, payload cap, edge-query reordering
- `packages/backend/convex/codebaseSymbols.ts` — propagate `truncated` through `GraphResult`
- `apps/web/src/hooks/useCodebaseGraphData.ts` — Zod schema + return type
- `apps/web/src/hooks/useCodebaseGraphController.ts` — surface `truncated` on the controller
- `apps/web/src/components/_components/canvas/renderer.ts` — paint codebase edge types in batched stroke passes
- `apps/web/src/components/codebases/CodebaseGraph.tsx` — truncation banner, edge-hover tooltip wiring

## Changes

### 1. read.ts — rename `rel` → `r` (lines 76-77)

The two constants are interpolated into `MATCH (a)-[r:TYPE]->(b)` patterns four times (`extends`, `implements`, `imports`, `calls`). All consuming queries already bound the relationship as `r`. One-line rename beats touching four `MATCH` patterns.

```ts
// BEFORE
const CALLS_TIER = "coalesce(rel.tier, 'INFERRED')";
const CALLS_CONF = "coalesce(rel.confidence, 1.0)";

// AFTER
const CALLS_TIER = "coalesce(r.tier, 'INFERRED')";
const CALLS_CONF = "coalesce(r.confidence, 1.0)";
```

The four `carry: false` edge queries (`contains`, `has_method`, `starts_process`, `includes`) don't interpolate these constants at all, so they're unaffected.

### 2. read.ts — cap nodes + edges, reorder queries (lines 85-106, 274-358)

Convex hard-caps any single array in an action return at 8192. Big monorepos easily blow past that on `CALLS` alone. Solution: cap both nodes and edges, drop the most numerous kind first, surface a `truncated` flag.

```ts
const MAX_GRAPH_ARRAY = 8192;

/**
 * Cap nodes, dropping the most numerous kind (`code-function`) first.
 * Files / classes / interfaces / processes are structural and far less
 * likely to overflow on their own — keeping them anchors the graph.
 */
function capNodes(
  nodes: OverviewNode[],
  cap: number,
): { nodes: OverviewNode[]; truncated: boolean } {
  if (nodes.length <= cap) return { nodes, truncated: false };
  const structural = nodes.filter((n) => n.kind !== "code-function");
  const functions = nodes.filter((n) => n.kind === "code-function");
  if (structural.length >= cap) {
    return { nodes: structural.slice(0, cap), truncated: true };
  }
  return {
    nodes: [...structural, ...functions.slice(0, cap - structural.length)],
    truncated: true,
  };
}
```

Edge queries reordered so the cheap structural types come first and the explosive types (`imports`, then `calls`) come last. A labeled `edgeLoop:` lets us bail out as soon as the cap fills:

```ts
edgeLoop: for (const q of edgeQueries) {
  if (edges.length >= MAX_GRAPH_ARRAY) {
    truncated = true;
    break;
  }
  const er = await session.run(q.cypher, { userId, codebaseId });
  for (const rec of er.records) {
    if (edges.length >= MAX_GRAPH_ARRAY) {
      truncated = true;
      break edgeLoop;
    }
    // …push edge…
  }
}
```

`getGraphOverview` now returns `{ nodes, edges, truncated }`. The truncation flag rides the response all the way to the canvas.

### 3. Backend bridge + client schema — thread `truncated` through

`packages/backend/convex/codebaseSymbols.ts` — added `truncated: boolean` to `GraphResult`.

`apps/web/src/hooks/useCodebaseGraphData.ts` — added `truncated: z.boolean()` to `graphResponseSchema` and `truncated: boolean` to `UseCodebaseGraphDataReturn`. The hook returns `truncated: graphQuery.data?.truncated ?? false`.

`apps/web/src/hooks/useCodebaseGraphController.ts` — exposed `truncated` on the controller interface so both `CodebaseGraph` and the page header can read it.

### 4. renderer.ts — paint codebase edge types (lines 242-295, 296-337)

Codebase edges piggyback on existing memory palette slots so we don't have to introduce a new theme entry across all 7 themes. Mapping:

- `imports` + `calls` → warm `relates_to` slot (semantic / behavioural connections)
- `contains` + `has_method` + `extends` + `implements` → cool `wiki_parent` slot (structural hierarchy)
- `starts_process` + `includes` → teal `mentions` slot (process membership)

**Non-hover branch — three batched stroke passes:**

```ts
// relates_to + imports + calls — warm hue for "user-forged" / behavioural edges.
ctx.strokeStyle = theme.edge.normalByType.relates_to;
ctx.beginPath();
for (const edge of edges) {
  if (
    edge.edgeType !== "relates_to" &&
    edge.edgeType !== "imports" &&
    edge.edgeType !== "calls"
  )
    continue;
  ctx.moveTo(edge.source.x ?? 0, edge.source.y ?? 0);
  ctx.lineTo(edge.target.x ?? 0, edge.target.y ?? 0);
}
ctx.stroke();

// wiki_parent + structural codebase edges — cool blue.
// (mirrors the warm pass for contains / has_method / extends / implements)

// mentions + process flow — teal-green.
// (mirrors the warm pass for starts_process / includes)
```

**Hover branch — extended the iterated edge-type list and added a `typeColor` ternary that maps codebase types to existing palette slots:**

```ts
for (const edgeType of [
  "tag",
  "relates_to",
  "imports",
  "wiki_parent",
  "mentions",
  "calls",
  "contains",
  "has_method",
  "extends",
  "implements",
  "starts_process",
  "includes",
] as const) {
  if (edgeType === "tag" && skipTagEdges) continue;
  const isStrongEdge = edgeType !== "tag";
  const widthMultiplier = isStrongEdge ? 2 : 1;
  const typeColor =
    edgeType === "imports" || edgeType === "calls"
      ? theme.edge.normalByType.relates_to
      : edgeType === "contains" ||
          edgeType === "has_method" ||
          edgeType === "extends" ||
          edgeType === "implements"
        ? theme.edge.normalByType.wiki_parent
        : edgeType === "starts_process" || edgeType === "includes"
          ? theme.edge.normalByType.mentions
          : theme.edge.normalByType[edgeType];
  // …existing two-pass dim / lit logic…
}
```

Edge hit-testing in `canvas/input-handler.ts` is type-agnostic — it calls `getEdgeAt` against all edges in `edgesRef.current`. Once the codebase edges are drawn, hover detection works automatically.

### 5. CodebaseGraph.tsx — truncation banner + edge-hover tooltip

Added a top-center banner that surfaces the `truncated` flag using `bg-warning/10` (per the design system rule on warnings). Conditional, `pointer-events-none` so it doesn't intercept canvas drags:

```tsx
{
  truncated && (
    <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 max-w-md px-3">
      <div className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-foreground backdrop-blur-md">
        <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span>
          Graph too large to fully display — showing a representative slice.
          Apply filters (kinds, process, blast radius) to narrow down.
        </span>
      </div>
    </div>
  );
}
```

Wired up edge hover for parity with the memory graph. State stays canvas-local (high-frequency, not worth the URL slot or controller hop):

```tsx
const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeInfo | null>(null);

<GraphCanvas
  // …existing props…
  onHoverEdge={setHoveredEdge}
/>;

{
  hoveredEdge && !selectedSymbolId && !hoveredNode && (
    <GraphEdgeTooltip
      edgeType={hoveredEdge.edgeType}
      sourceTitle={hoveredEdge.sourceTitle}
      targetTitle={hoveredEdge.targetTitle}
      reason={hoveredEdge.reason}
      score={hoveredEdge.score}
      viewportX={hoveredEdge.viewportX}
      viewportY={hoveredEdge.viewportY}
    />
  );
}
```

Same `!selectedSymbolId && !hoveredNode` guard the memory graph uses, so the node tooltip wins when both hover at once and both go quiet while the detail panel is open. `GraphEdgeTooltip` already had labels for every codebase edge type (`Calls`, `Contains`, `Has method`, `Extends`, `Implements`, `Starts process`, `In process`) — no extra wiring needed there.

## Verification

- `cd apps/web && npx tsc --noEmit` — exit 0.
- `cd packages/backend && npx convex codegen --typecheck enable` — clean.
- Reload `http://localhost:5173/codebases/:id` — graph renders nodes + edges, hover an edge shows the type label tooltip, oversized graphs surface the warning banner.

## Why these specific tradeoffs

- **Rename `rel` → `r`** instead of `r` → `rel`: every other query in the file uses `r`. Touching one line beats touching four.
- **Drop `code-function` first** when capping: structural symbols (files / classes / interfaces / processes) are the navigational anchors. Functions are leafy and the user can still find them by drilling in via blast radius / process filters.
- **Reorder edge queries** instead of weighting them: same end result with fewer moving parts. `imports` and `calls` last means a truncated payload still gets the structural skeleton.
- **Reuse memory palette slots** for codebase edge colours instead of adding new theme entries: 7 themes × 8 new edge colours = 56 new theme values to design and maintain. The semantic mapping (warm = behavioural, cool = structural, teal = membership) reads cleanly.

## Open questions

None.
