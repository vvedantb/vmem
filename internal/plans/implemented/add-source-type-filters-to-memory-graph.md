# Add Source & Type Filters to Memory Graph

## Context

The memory graph view currently shows only 3 filter tabs (Profile/Kind/Tags) in `UnifiedFilterPanel`, while the list view shows all 5 (adds Source/Type). We want parity so users can filter the graph by memory source (web, extension, notion, etc.) and memory type (profile/episodic/knowledge).

Secondary goal: unify graph filter state with the list view's nuqs URL state (`memoriesSearchParams`). Today the graph uses local `useState` for tags/kinds, so filters reset when switching graph↔list view. Profile is already nuqs; extending to tags/kinds/sources/types makes all filters URL-shareable and syncs across views automatically.

## Decisions (confirmed with user)

- **Unify graph filter state with nuqs** — use the existing `memoriesSearchParams` (already has `tags`, `kinds`, `sources`, `types`, `profile`)
- **Extend graph API** to return `source` and `type` on memory nodes (pure projection, data already in Neo4j)
- **Non-memory passthrough** — source/type filters narrow memories only; wiki/skill nodes pass through (matches list-view convention in `listItemMatchesSourceFilter`/`Type`)

## Files to Modify

### Backend

- `packages/backend/convex/graphApi.ts` — `GraphNodeEntry` + `annotateMemoryNodes`
- `packages/backend/convex/memoryService.ts` — Cypher RETURN + node mapping in `getGraphData()`

### Frontend

- `apps/web/src/hooks/useGraphData.ts` — Zod schema for graph node
- `apps/web/src/components/_components/graph-data.ts` — `ApiGraphNode`, `buildGraphData`, new `getAllSources`/`getAllTypes`
- `apps/web/src/components/MemoryGraph.tsx` — swap local `useState` for `useQueryStates`, add source/type
- `apps/web/src/components/_components/GraphControlPanel.tsx` — accept source/type props, drop `visibleTabs` override

---

## Implementation

### Phase 1 — Backend projection (graphApi + memoryService)

**`packages/backend/convex/memoryService.ts`** (`getGraphData`, lines ~1221–1299)

Cypher RETURN clause (line ~1259):

```cypher
RETURN n.id AS id, n.title AS title, n.content AS content,
       n.tags AS tags, n.createdAt AS createdAt,
       n.source AS source, n.type AS type
```

Node mapping (line ~1277):

```ts
nodes.push({
  id,
  title,
  content,
  tags,
  createdAt,
  source: record.get("source") ?? undefined,
  type: record.get("type") ?? undefined,
});
```

**`packages/backend/convex/graphApi.ts`** (lines 14–68)

Extend `GraphNodeEntry` interface and `MemoryGraph.nodes` type:

```ts
interface GraphNodeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
  kind: GraphNodeKind;
  source?: string; // NEW (memory nodes only)
  type?: MemoryType; // NEW (memory nodes only)
}
```

Forward fields through `annotateMemoryNodes()` (line 59).

### Phase 2 — Frontend data model

**`apps/web/src/hooks/useGraphData.ts`** — extend Zod schema:

```ts
const graphNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  kind: graphNodeKindSchema,
  source: z.string().optional(),
  type: z.enum(["profile", "episodic", "knowledge"]).optional(),
});
```

**`apps/web/src/components/_components/graph-data.ts`**

Add fields to `ApiGraphNode` (line 14).

Add `getAllSources()` and `getAllTypes()` (mirror `getAllKinds`):

```ts
export interface SourceStat {
  source: string;
  count: number;
}
export interface TypeStat {
  type: MemoryType;
  count: number;
}

export function getAllSources(apiNodes: ApiGraphNode[]): SourceStat[];
export function getAllTypes(apiNodes: ApiGraphNode[]): TypeStat[];
```

Extend `buildGraphData()` signature with `activeSources: Set<string>`, `activeTypes: Set<MemoryType>`. Apply after kind/tag filtering with non-memory passthrough:

```ts
const sourceFiltered =
  activeSources.size > 0
    ? tagFiltered.filter(
        (n) => n.kind !== "memory" || (n.source && activeSources.has(n.source)),
      )
    : tagFiltered;

const filteredNodes =
  activeTypes.size > 0
    ? sourceFiltered.filter(
        (n) => n.kind !== "memory" || (n.type && activeTypes.has(n.type)),
      )
    : sourceFiltered;
```

### Phase 3 — Graph view state unification (MemoryGraph.tsx)

Replace local `useState` for tags/kinds with nuqs, add sources/types:

**Before** (lines 81–91):

```ts
const [activeTags, setActiveTags] = useState<Set<string>>(EMPTY_SET);
const [activeKinds, setActiveKinds] = useState<Set<GraphNodeKind>>(
  () => new Set(DEFAULT_ACTIVE_KINDS),
);
```

**After**:

```ts
const [params, setParams] = useQueryStates(memoriesSearchParams);

// Convert nuqs arrays <-> Sets at use sites (buildGraphData still takes Sets)
const activeTags = useMemo(() => new Set(params.tags), [params.tags]);
const activeKinds = useMemo(
  () =>
    params.kinds.length > 0
      ? new Set(params.kinds as GraphNodeKind[])
      : new Set(DEFAULT_ACTIVE_KINDS),
  [params.kinds],
);
const activeSources = useMemo(() => new Set(params.sources), [params.sources]);
const activeTypes = useMemo(() => new Set(params.types), [params.types]);
```

**Handlers** — rewrite `handleToggleTag`/`handleToggleKind` to update nuqs arrays, add `handleToggleSource`/`handleToggleType`. Remove the local `profileId`/`onProfileChange` props from `MemoryGraphProps` since the route already manages it via nuqs — MemoryGraph can read it directly.

Pass new filter args to `buildGraphData()` (line 105):

```ts
buildGraphData(
  apiNodes,
  apiTagEdges,
  allRelatesToEdges,
  apiWikiParentEdges,
  activeTags,
  activeKinds,
  activeSources,
  activeTypes,
);
```

Compute `allSources`/`allTypes` via `useMemo(() => getAllSources(apiNodes), [apiNodes])`.

### Phase 4 — GraphControlPanel wiring

**`apps/web/src/components/_components/GraphControlPanel.tsx`**

1. **Drop `visibleTabs={["profile", "kind", "tags"]}` override** (line 294) — let `UnifiedFilterPanel` use its default (all 5 tabs).

2. Add props:

```ts
allSources: SourceStat[];
activeSources: Set<string>;
onToggleSource: (source: string) => void;
allTypes: TypeStat[];
activeTypes: Set<MemoryType>;
onToggleType: (type: MemoryType) => void;
distinctSources: string[]; // derived list passed to UnifiedFilterPanel
```

3. Add Set→array adapters matching existing kind/tag pattern (lines 156–200). Follow the exact same `handleSourcesChange`/`handleTypesChange` pattern.

4. Pass through to `UnifiedFilterPanel` (line 282):

```tsx
<UnifiedFilterPanel
  ... existing ...
  distinctSources={distinctSources}
  selectedSources={selectedSourcesArray}
  onSourcesChange={handleSourcesChange}
  selectedTypes={selectedTypesArray}
  onTypesChange={handleTypesChange}
  // no visibleTabs override — defaults to all 5
/>
```

---

## Reused Code (no new abstractions needed)

- **`UnifiedFilterPanel`** — already has Source/Type tabs fully implemented; just needs props
- **`memoriesSearchParams`** (`apps/web/src/routes/_main/memories/-searchParams.ts`) — already defines `sources`, `types`, `tags`, `kinds`, `profile` fields
- **`MEMORY_TYPES`** / **`MemoryType`** / **`formatMemorySourceLabel`** from `@/lib/memories` — reused
- **Filter passthrough pattern** — mirrors `listItemMatchesSourceFilter`/`listItemMatchesTypeFilter` in `list-items.ts`

## Verification

1. **Backend**: `cd packages/backend && npx convex codegen --typecheck enable` — confirm graphApi return types compile
2. **Frontend**: `cd apps/web && npx tsc --noEmit` — must pass
3. **Manual E2E**:
   - Open `/memories` in graph view
   - Click Filter → all 5 tabs visible (Profile/Kind/Tags/Source/Type)
   - Select a Source (e.g. "web") → memory nodes without that source hide; wiki/skill nodes remain visible
   - Select a Type (e.g. "episodic") → same passthrough behavior
   - URL updates: `?view=graph&sources=web&types=episodic`
   - Switch to list view → filters carry over (same URL params)
   - Switch back to graph → filters preserved
4. **Counts**: Source/Type tab badges reflect active counts; footer "Showing X of Y" updates live
