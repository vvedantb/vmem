# Entity Extraction + Graph-Augmented Retrieval

## Overview

This feature closes the entity-understanding gap between vmem and competitors (Mem0, Supermemory) by:

1. **Extracting named entities** (people, organizations, places, technologies) during LLM enrichment
2. **Storing entities as hub nodes** in Neo4j with `MENTIONS` edges connecting them to memories
3. **Using graph traversal** (1-2 hops through RELATES_TO and entity hubs) as a retrieval scoring signal
4. **Rendering entities** on the graph canvas as gold starburst nodes that memories orbit

## Architecture

### Neo4j Schema

```
(:Entity {userId, normalizedName, type, name, id, createdAt})
  - Composite uniqueness constraint on (userId, normalizedName, type)
  - Per-user isolation — same entity name across users doesn't collide
  - Types: person, organization, place, technology

(:Memory)-[:MENTIONS]->(:Entity)
  - Created during enrichment (both inline and backfill)
  - Idempotent via MERGE on entity + MERGE on edge
```

### Entity Extraction Flow

```
Memory created
  → LLM enrichment prompt (already runs for tags + related IDs)
  → Expanded to also request entities in JSON response
  → parseFullEnrichmentResponse() extracts entities
  → normalizeEntityName() deduplicates (lowercase, trim, collapse whitespace)
  → applyEnrichment() MERGE-creates Entity nodes + MENTIONS edges in same tx
```

Zero additional API cost — entities piggyback on the existing enrichment LLM call.

### Graph-Augmented Retrieval

After BM25 + vector search merge, the top-5 seed results expand through the knowledge graph:

```
Leg 1: seed→RELATES_TO→neighbor (1-hop direct)
Leg 2: seed→MENTIONS→entity←MENTIONS→neighbor (1-hop via entity hub)
Leg 3: seed→RELATES_TO→mid→RELATES_TO→neighbor (2-hop)
```

Scoring formula:

```
totalScore =
  rrfCombined * 0.45 +      // BM25 + vector (reciprocal rank fusion)
  graphBoost * 0.10 +        // 1-hop = 1.0, 2-hop = 0.5
  recency * 0.225 +
  confidence * 0.225
```

Graph-only discoveries (no BM25/vector hit) score at most 0.55 — below strong text/semantic matches but above weak ones.

### Graph Visualization

- Entity nodes render as **8-pointed gold starbursts** — visually distinct from circles (memories), diamonds (wiki docs), squares (folders), hexagons (skills)
- Entity node sizing scales with degree (number of mentioning memories), capped at size 25
- MENTIONS edges render in teal-green across all 7 view themes
- Entities are filterable as a Kind in the graph/list filter panel

### Backfill

Self-rescheduling Convex action (`startEntityBackfill`) processes existing memories in batches of 20. Each memory requires an LLM call to extract entities. Users without an OPENROUTER_API_KEY are skipped. Run from the Convex dashboard:

```
internal.neo4jActions.migration.startEntityBackfill
```

## Files Modified

### Backend (packages/backend)

- `src/neo4j/setup.ts` — Entity constraint + index
- `src/enrichmentPrompt.ts` — Prompt expansion, entity parser, types
- `src/neo4j/memoryService.ts` — applyEnrichment (entities), getGraphData/getLocalGraph (entity queries), expandViaGraph, fetchMemoryMetadata, retrieveMemories scoring
- `convex/neo4jActions/enrichment.ts` — entities arg
- `convex/neo4jActions/graph.ts` — entities + mentionsEdges in capGraph
- `convex/neo4jActions/migration.ts` — entity backfill actions
- `convex/memoryApi.ts` — entities arg passthrough
- `convex/graphApi.ts` — entity nodes + mentionsEdges in GraphResult

### Web App (apps/web)

- `canvas/types.ts` — entity kind, mentions edge type, entityType field
- `graph-data.ts` — ApiMentionsEdge, entity sizing, mentions edges in buildGraphData
- `graph-types.ts` — mentions in EdgeAttributes
- `graph-colors.ts` — entity gold color (hsl 45)
- `graph-view-themes.ts` — mentions edge color in all 7 themes
- `canvas/renderer.ts` — starburst shape, mentions edge rendering + labels
- `ShapeIndicator.tsx` — star clip-path for entity
- `GraphEdgeTooltip.tsx` — "Mentions" label
- `GraphHeaderControls.tsx` + `UnifiedFilterPanel.tsx` — entity in kind counts
- `useGraphData.ts` — entity zod schema, mentionsEdges
- `useMemoryGraphController.ts` — thread apiMentionsEdges
- `useEnrichmentQueueDrain.ts` — pass entities
- `list-items.ts` — entity kind

### Chrome Extension (apps/chrome-extension)

- `api-client.ts` — entities param on applyEnrichment
- `pending-enrichment-drain.ts` — pass entities
- `enrichment-engine.ts` — return entities from WebLLM
- `chrome-ai-enrichment.ts` — return entities from Chrome AI
- `enrichment-router.ts` — entities in result type
