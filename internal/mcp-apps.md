# MCP Apps architecture (vmem)

**Decided:** 2026-05-23  
**Status:** Active — do not adopt [Skybridge](https://docs.skybridge.tech) for embedded vmem MCP views unless criteria below change.

## Summary

vmem ships interactive MCP views (e.g. `memory_graph`) inside the **existing Convex MCP server**, using **`@modelcontextprotocol/ext-apps`** directly and a **prebundled HTML** asset. We evaluated Skybridge (Alpic’s React framework for ChatGPT + MCP Apps) and **rejected adoption** for this stack: wrong project shape, extra bundle weight, and no fix for problems we already solved (SSE, payload size, viewport height).

## Dev deployment (only)

Use the **cloud dev** Convex deployment — not prod.

| Setting                    | Value                                                     |
| -------------------------- | --------------------------------------------------------- |
| MCP URL                    | `https://outgoing-reindeer-268.eu-west-1.convex.site/mcp` |
| Convex cloud               | `https://outgoing-reindeer-268.eu-west-1.convex.cloud`    |
| `WEB_APP_URL` (Convex env) | `https://vmem-git-staging-vedantb.vercel.app`             |

`WEB_APP_URL` is for OAuth redirects only (`mcp/webAppUrl.ts`).

## What Skybridge optimizes for

Per `.claude/skills/skybridge/SKILL.md`:

- A **standalone MCP app** (SPEC.md, Vite dev server, optional Alpic deploy)
- **React** views with typed hooks (`useViewState`, `useCallTool`, `useLayout`, …)
- **Dual consumer**: human uses the view; LLM reads **shared view state** (`data-llm`)
- **ChatGPT Apps SDK + MCP Apps** from one codebase

vmem is a **memory layer** with 20+ tools on one endpoint — not a greenfield Skybridge product. See `internal/product-scope.md`.

## What vmem does instead

| Concern             | Approach                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------- |
| MCP server          | Convex `httpAction` on `/mcp` (`packages/backend/convex/mcp/`)                           |
| App protocol        | `@modelcontextprotocol/ext-apps` (`App`, `registerAppTool`, `registerAppResource`)       |
| View UI             | Vanilla TS + canvas in `packages/backend/mcp-ui/<app>/`                                  |
| Ship to hosts       | `scripts/build-*-mcp-app.mjs` → `convex/mcp/bundled/*Html.ts` (inlined in tool/resource) |
| Graph data          | `mcpGraph.ts` internal action → tool `structuredContent` + short `content` for the model |
| Claude reachability | Stateless POST only — `GET`/`DELETE` on `/mcp` return 405 (same as Eva)                  |
| Small tool results  | No duplicate full JSON in `content`; caps in `mcpGraph.ts`                               |
| Taller iframe       | `sendSizeChanged({ height })` + CSS min-height (not Skybridge-specific)                  |

### `memory_graph` file map

- Tool + resource: `packages/backend/convex/mcp/memoryGraphApp.ts`
- Data: `packages/backend/convex/mcpGraph.ts`
- UI source: `packages/backend/mcp-ui/memory-graph/main.ts`, `main.css`
- Bundle output: `packages/backend/convex/mcp/bundled/memoryGraphHtml.ts`
- Build: `pnpm --filter @vmem/backend build:mcp-graph-ui` (see `packages/backend/package.json`)

## Fit checklist (Skybridge vs vmem)

| Skybridge expectation        | vmem today                                         | Match                                |
| ---------------------------- | -------------------------------------------------- | ------------------------------------ |
| Dedicated MCP app repo       | Convex monolith + bundled HTML                     | No                                   |
| React + Skybridge hooks      | Vanilla + ext-apps `App`                           | No                                   |
| Vite HMR as primary dev loop | esbuild bundle → commit HTML                       | No                                   |
| ChatGPT + Claude dual target | MCP Apps hosts (Claude-first)                      | Partial                              |
| LLM ↔ view via view state    | Summary in `content`; graph in `structuredContent` | Partial (enough for view-only graph) |
| OAuth                        | Clerk on Convex MCP                                | Already solved                       |
| Layout / height              | `sendSizeChanged`, host theme                      | Same protocol, raw API               |

## When to reconsider Skybridge

Only if several become true:

1. **Three or more** interactive MCP views with shared React patterns
2. **ChatGPT Apps directory** parity required from the **same** view codebase
3. A **separate** deployable “vmem MCP app” product (own SPEC.md, not Convex-bundled HTML)
4. Heavy need for **LLM ↔ UI state sync** (selection, filters, pan) as first-class `data-llm` flows

Until then, prefer **ext-apps only**, or **React + ext-apps** inside `mcp-ui/` without pulling in Skybridge’s server template.

## Do not expect Skybridge to fix

- **“Unable to reach vmem”** — transport/SSE on `/mcp`, not UI framework
- **Wrong favicon in Claude custom connectors** — client UI ignores SEP-973 icons; not worth server-side workarounds
- **Tool result too large** — payload shape and caps in `mcpGraph.ts` / tool handlers
- **Short iframe** — host limits; use `sendSizeChanged` / `getHostContext().maxHeight` / `requestDisplayMode('fullscreen')` where supported

## Improvements without Skybridge

- Read `maxHeight` from `getHostContext()` and size the canvas accordingly
- `requestDisplayMode('fullscreen')` when the host supports it
- `updateModelContext` / tool notifications when the user selects a node (dual-consumer pattern from Skybridge docs, via ext-apps APIs)

## References

- Skybridge skill: `.claude/skills/skybridge/SKILL.md`
- MCP Apps SDK: `@modelcontextprotocol/ext-apps`
- User docs: `apps/docs/mcp/setup.mdx`, `apps/docs/mcp/overview.mdx`
- Changelog: `internal/changelog.md` (memory graph, SSE, payload, viewport entries)
