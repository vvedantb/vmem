# vmem product scope

**Decided:** 2026-05-24  
**Status:** Active — do not expand scope without revisiting this doc.

## Positioning

vmem is a **model-agnostic memory and context layer** (Neo4j graph + hybrid retrieval + MCP). It is **not** a general agent platform.

### In scope

- Store, retrieve, update, and explain user knowledge across sessions and tools
- **Ingest** external content **into memories** (connectors, extension, imports, MCP `memory_add`)
- Minimal local chat/voice to use memories without a third-party host
- Integrate **with** action platforms; do not become one

### Out of scope (do not build first-class vmem features for)

| Platform                                 | What it does                                   | vmem relationship                                                                                                        |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Composio](https://composio.dev/for-you) | OAuth + live agent **tools** across 1000+ apps | Complementary — users can run Composio + vmem MCP side by side; optional future “save tool result to memory” bridge only |
| [AgentMail](https://www.agentmail.to/)   | Agent **email inboxes**                        | Different product (communication runtime)                                                                                |
| [Daytona](https://www.daytona.io/docs)   | **Sandboxes** for code execution               | Different product (execution infra)                                                                                      |
| Plaid-style finance                      | Bank/fintech connectivity                      | Only if explicitly a memory domain later                                                                                 |

### Architecture intent (README diagram)

- **Native:** `memory_*` MCP tools, Convex/Neo4j, context prompt
- **Proxy / external:** codebase, email, browser via separate MCPs or hosts — not reimplemented inside vmem

### Connectors definition

Connectors = **batch ingest ETL** into memories (`upsertFromSource`), not Composio-style live tool calls. Manual “Sync now” today; scheduled sync is a planned memory-layer improvement, not a pivot to agent actions.

---

## Memory-layer roadmap vs current implementation

Audit of the four deepening features (2026-05-24). Legend: ✅ shipped · 🟡 partial · ❌ not built · 📋 stub only.

### 1. More ingest connectors

| Provider                 | Status | Notes                                                               |
| ------------------------ | ------ | ------------------------------------------------------------------- |
| Google Drive             | ✅     | OAuth + sync                                                        |
| OneDrive                 | ✅     | OAuth + sync (MVP: root-level files)                                |
| Notion                   | ✅     | OAuth + sync                                                        |
| Linear                   | ✅     | OAuth + sync; 30d default + “all history” option                    |
| Gmail                    | ❌     | `gmail` in schema/dedup lists; **no** OAuth, sync, or settings card |
| Slack                    | 📋     | Settings UI “Coming Soon”; no `provider`                            |
| Dropbox                  | 📋     | Same                                                                |
| GitHub (connectors page) | 🟡     | Separate **codebases** pipeline, not `upsertFromSource`             |

**Gap:** Gmail + Slack ingest called out in `docs/superpowers/specs/2026-03-22-connector-sync-design.md` but only Drive/Notion (+ later OneDrive/Linear) were implemented.

### 2. Scheduled / incremental connector sync

| Capability                              | Status | Notes                                                                                                          |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Manual “Sync now”                       | ✅     | `connectorSync.startSync`                                                                                      |
| Scheduled connector cron                | ❌     | `crons.ts` only runs **daily codebase sync**                                                                   |
| Webhooks (Notion/Drive push)            | ❌     | Design doc explicitly deferred                                                                                 |
| Incremental fetch (API filters)         | 🟡     | **Linear:** `updatedAt` window on re-sync; **Drive/Notion:** full list each run, dedup via MERGE on `sourceId` |
| Extension auto-sync (history/bookmarks) | ✅     | Separate from connectors; `chrome.alarms` ~30min                                                               |

**Gap:** No connector equivalent of codebase `kickoffDailyCodebaseSync` or extension alarms.

### 3. Stronger provenance (“what got remembered from where”)

| Capability                                                        | Status | Notes                                                                                |
| ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `sourceType`, `sourceId`, `sourceUrl`, `sourceSyncedAt` on Memory | ✅     | `packages/backend/src/neo4j/memory/connectors.ts`                                    |
| `FROM_SOURCE` + graph connector logos                             | ✅     | Canvas / legend                                                                      |
| Connector card `lastSyncAt` / `itemsSynced`                       | ✅     | `ConnectorCard.tsx`                                                                  |
| Memory detail: link back to source URL                            | ❌     | `sourceUrl` not surfaced in web memory UI (grep)                                     |
| Per-memory “stale vs source” / deleted-at-source                  | ❌     | No tombstone or freshness UX                                                         |
| Stuck connector sync recovery UI                                  | ❌     | Planned in connector plan; **codebases** have stale-sync patterns, connectors do not |

**Gap:** Backend provenance fields exist; user-facing provenance and staleness UX are thin.

### 4. Action result → memory

| Capability                                | Status | Notes                           |
| ----------------------------------------- | ------ | ------------------------------- |
| MCP `memory_add` (agent saves explicitly) | ✅     | Primary write path for agents   |
| SDK `storeFromInstruction`                | ✅     | Server-side extraction          |
| Webhook / “after external tool” bridge    | ❌     | No Composio or generic hook     |
| Auto-save Composio tool output            | ❌     | Out of scope per decision above |

**Gap:** Only manual/agent-initiated writes; no passive capture from third-party tool runs.

---

## Recommended next memory-layer work (priority)

1. **Gmail ingest** (if still desired) — completes original connector spec
2. **Connector scheduled sync** — daily or per-connector interval (mirror codebase cron pattern)
3. **Incremental Drive/Notion** — `modifiedTime` / last sync cursor to reduce full scans
4. **Memory detail provenance** — show `sourceUrl`, `sourceSyncedAt`, connector badge + “Re-sync source”
5. **Stuck sync reset** — port codebase stale-sync pattern to `connectors` table
6. **Optional:** thin “save to vmem” webhook or MCP helper for external tool summaries (not full Composio)

---

## References

- `FYP-PROJECT-CONTEXT.md` §3.1 — do not build another chat app; memory layer underneath
- `docs/superpowers/specs/2026-03-22-connector-sync-design.md` — original connector design (Gmail planned)
- `apps/docs/features/connectors.mdx` — user-facing connector list
