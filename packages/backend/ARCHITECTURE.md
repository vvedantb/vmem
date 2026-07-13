# `@vmem/backend` — architecture map

Orientation page for the backend. For _why_ vmem exists see the root `README.md`; this doc traces _how a request moves through the layers_ and _which module does which job_. Filled in as the code is simplified — sections marked _(TBD)_ are not yet documented.

## The layers (outer → inner)

A request never skips a layer. It flows down and the result flows back up.

```
client (web / extension / MCP host / HTTP)
   │
   ▼
convex/http/            HTTP + MCP entry points (routes, auth, request parsing)
convex/*.ts             registered Convex functions (query / mutation / action)
   │  (Convex "use node" actions call into ↓)
   ▼
convex/neo4jActions/    Node-runtime actions: the ONLY bridge from Convex to the engine
   │
   ▼
engine/neo4j/           Neo4j queries, retrieval, enrichment (no Convex imports)
engine/codebase/        codebase sync orchestration
engine/parsers/         file parsers (pdf, text)
   │
   ▼
Neo4j (Aura) graph
```

**Why the split?** `engine/` has no Convex dependency, so it can be unit-tested directly and reused from any Node context. `convex/neo4jActions/` is the marshalling layer: it runs in Convex's Node runtime (`"use node"`), pulls secrets/args from Convex, calls the engine, and writes results back. Convex query/mutation functions (V8 runtime) cannot import the engine directly — they schedule or call these actions.

## Directory guide

| Path                     | Job                                                       | Entry points                                             |
| ------------------------ | --------------------------------------------------------- | -------------------------------------------------------- |
| `convex/http/`           | HTTP routes + MCP server transport                        | `http.ts` (router)                                       |
| `convex/mcp/`            | MCP tool definitions, handlers, schemas                   | tool registry                                            |
| `convex/memoryApi/`      | `/api/v1/*` REST surface for memories                     | HTTP actions                                             |
| `convex/neo4jActions/`   | Node bridge Convex → engine                               | `memories.ts`, `dreamMode/`, `connectors/`, `migration/` |
| `convex/connectors/`     | OAuth + connector CRUD (Drive, Notion, …)                 | `oauth.ts`, `crud.ts`                                    |
| `convex/lib/`            | Convex-side helpers (crypto, openRouter, env, snapshots)  | imported widely                                          |
| `convex/cloudLib/`       | Convex-coupled chat tool helpers                          | chat actions                                             |
| `convex/prompts/`        | LLM prompt builders + parsers (enrichment, v2, dream)     | actions                                                  |
| `engine/neo4j/`          | driver, setup, retrieval, memory CRUD, dream mode         | `driver.ts`, `memory/`, `codebase/`                      |
| `engine/neo4j/memory/`   | the memory graph: crud, retrieve, proposals, graph, dedup | called from `neo4jActions`                               |
| `engine/neo4j/codebase/` | symbol parsing + dependency graph                         | `parse.ts`, `read.ts`, `write.ts`                        |
| `neo4j-cli/`             | bench eval CLI (not runtime)                              | `eval:bench` (seed + report)                             |
| `mcp-ui/`                | interactive MCP App (memory graph UI)                     | `memory-graph/main.ts`                                   |

## Request-path traces

_(filled in per-domain as the simplify loop reaches each area)_

### Memory: store & retrieve _(TBD)_

### Codebase sync _(TBD)_

### Connectors ingest _(TBD)_

### Files → memories _(TBD)_

### Skills & wiki _(TBD)_

### Dream mode _(TBD)_

### Chat _(TBD)_

## Conventions

- Table fields single-sourced as `xxxFields` in `convex/validators.ts`; reused in `schema.ts` and return validators.
- Convex document types come from `Doc<"table">` / `Id<"table">` — never hand-written interfaces.
- External data parsed with zod at the boundary; no `any` / `unknown` / `as` / `!` downstream.
- `engine/` never imports from `convex/`; the dependency arrow points one way (Convex → engine).
