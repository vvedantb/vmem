# vmem — Comprehensive Project Context Document

**Purpose:** This document is intended as **project context for Claude** (or other AI assistants) when writing the City, University of London Final Year Project report, designing features, or answering architecture questions. It synthesises the entire codebase, design decisions, tradeoffs, chronology, and implementation detail as of **May 2026**.

**Author:** Vedant Bhopatrao  
**Project:** vmem — LLM Memory Layer  
**Institution:** City, University of London — BSc Computer Science with Professional Pathway  
**Consultant:** Dr Riad Ibadulla  
**Public URL:** https://vmem.vedantb.com

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement and Project Objectives](#2-problem-statement-and-project-objectives)
3. [Core Design Philosophy](#3-core-design-philosophy)
4. [Architectural Evolution Timeline](#4-architectural-evolution-timeline)
5. [Current System Architecture](#5-current-system-architecture)
6. [Technology Stack and Decision Tradeoffs](#6-technology-stack-and-decision-tradeoffs)
7. [Monorepo Layout and Scale](#7-monorepo-layout-and-scale)
8. [Convex Control Plane (Operational Data)](#8-convex-control-plane-operational-data)
9. [Neo4j Memory Graph (Source of Truth for Memories)](#9-neo4j-memory-graph-source-of-truth-for-memories)
10. [Memory Lifecycle — End to End](#10-memory-lifecycle--end-to-end)
11. [Hybrid Retrieval Pipeline (Core Technical Contribution)](#11-hybrid-retrieval-pipeline-core-technical-contribution)
12. [Context Prompt and Implicit Memory (MCP Resources)](#12-context-prompt-and-implicit-memory-mcp-resources)
13. [MCP Server Integration](#13-mcp-server-integration)
14. [HTTP REST API and @vmem/sdk](#14-http-rest-api-and-vmemsdk)
15. [Proposed Updates and Dream Mode](#15-proposed-updates-and-dream-mode)
16. [Connectors and External Data Ingestion](#16-connectors-and-external-data-ingestion)
17. [Web Application (apps/web)](#17-web-application-appsweb)
18. [Chrome Extension (apps/chrome-extension)](#18-chrome-extension-appschrome-extension)
19. [Mobile Application (apps/mobile)](#19-mobile-application-appsmobile)
20. [Local LLM Strategy (Privacy and Cost)](#20-local-llm-strategy-privacy-and-cost)
21. [Authentication and Security Model](#21-authentication-and-security-model)
22. [UI Design System Conventions](#22-ui-design-system-conventions)
23. [Evaluation, Testing, and Validation](#23-evaluation-testing-and-validation)
24. [Competitive Positioning](#24-competitive-positioning)
25. [Known Limitations and Future Work](#25-known-limitations-and-future-work)
26. [FYP Report Mapping (Chapters 4 and 5)](#26-fyp-report-mapping-chapters-4-and-5)
27. [Key File Index](#27-key-file-index)
28. [Glossary](#28-glossary)

**Part II — Deep Implementation Reference**

29. [Extended Development Chronology (Month-by-Month)](#29-extended-development-chronology-month-by-month)
30. [Complete HTTP and OAuth Route Registry](#30-complete-http-and-oauth-route-registry)
31. [Dedup Pipeline — Layer-by-Layer Specification](#31-dedup-pipeline--layer-by-layer-specification)
32. [Post-Create Fan-Out and Scheduler Jobs](#32-post-create-fan-out-and-scheduler-jobs)
33. [V2 Fact Extraction Pipeline](#33-v2-fact-extraction-pipeline)
34. [SDK Agent Mode — Instruction Store/Update/Retrieve](#34-sdk-agent-mode--instruction-storeupdateretrieve)
35. [Enrichment Pipeline (Server-Side)](#35-enrichment-pipeline-server-side)
36. [Scoring Mathematics and Constants](#36-scoring-mathematics-and-constants)
37. [Graph Expansion and Entity Leg Details](#37-graph-expansion-and-entity-leg-details)
38. [Dream Mode V2 — Algorithm Specification](#38-dream-mode-v2--algorithm-specification)
39. [Proposed Updates — Resolution State Machine](#39-proposed-updates--resolution-state-machine)
40. [Teams, Profiles, and Authorization Matrix](#40-teams-profiles-and-authorization-matrix)
41. [Wiki, Skills, Codebases, and Files](#41-wiki-skills-codebases-and-files)
42. [Chat Threads and Memory RAG Integration](#42-chat-threads-and-memory-rag-integration)
43. [Chrome Extension — Message Protocol and Flows](#43-chrome-extension--message-protocol-and-flows)
44. [Import and Export Data Paths](#44-import-and-export-data-paths)
45. [OpenRouter Logging and Cost Accounting](#45-openrouter-logging-and-cost-accounting)
46. [Retrieval Evaluation — Full Query Set and Methodology](#46-retrieval-evaluation--full-query-set-and-methodology)
47. [Neo4j CLI Scripts (Seed, Unseed, Eval)](#47-neo4j-cli-scripts-seed-unseed-eval)
48. [Convex Components and Third-Party Integrations](#48-convex-components-and-third-party-integrations)
49. [Package Scripts and Developer Workflows](#49-package-scripts-and-developer-workflows)
50. [Error Handling and Degradation Matrix](#50-error-handling-and-degradation-matrix)
51. [How to Use This Document with Claude](#51-how-to-use-this-document-with-claude)

---

## 1. Executive Summary

**vmem** is a **model-agnostic persistent memory layer** for LLMs and AI agents. It allows users to store, retrieve, and update personal knowledge that persists across chat sessions, browser tabs, and AI providers (Claude, ChatGPT, Cursor, etc.).

Unlike proprietary platform memory (ChatGPT Memory, Claude Memory) or opaque hosted APIs (Mem0, Supermemory), vmem offers:

- **Open integration** via Model Context Protocol (MCP) and HTTP REST API
- **Inspectable retrieval** via Context Trace (per-signal score breakdown)
- **User-controlled lifecycle** — pin, suppress, expire, forget, approve conflicts before overwrite
- **Graph-based relational memory** in Neo4j (not flat vector-only storage)
- **Hybrid retrieval** — fulltext + vector + chunk + entity + graph expansion fused with RRF

The system deliberately **does not compete as a chat application**. Value is delivered inside tools users already use. vmem makes those tools remember.

**Scale (approximate, May 2026):**

| Component                   | TS/TSX lines                         | Files              |
| --------------------------- | ------------------------------------ | ------------------ |
| `apps/web/src`              | ~36,400                              | ~305               |
| `apps/chrome-extension/src` | ~5,250                               | ~51                |
| `apps/mobile`               | ~2,500                               | ~25                |
| `packages/ui/src`           | ~4,100                               | ~49                |
| `packages/backend`          | Large (Convex + Neo4j service layer) | ~94 Convex modules |
| `packages/sdk/src`          | ~660                                 | ~6                 |

**Commit history:** ~1000+ commits over the project lifetime (per report notes).

---

## 2. Problem Statement and Project Objectives

### 2.1 The Problem

1. **Stateless LLMs** — Models process a context window per session; nothing persists after the session ends.
2. **Context windows are not memory** — Even 200k-token windows suffer context rot beyond ~70% utilisation; effective usable context is much smaller once system prompts, MCP tool definitions, and compaction buffers are accounted for.
3. **Platform fragmentation** — Memory in ChatGPT does not transfer to Claude. External memory APIs are often opaque (no explanation of why a memory was retrieved).

### 2.2 Primary FYP Objective (from report)

> Design and build a reliable, open, model-agnostic memory layer that enables any AI to **store, retrieve, and update** user knowledge securely and efficiently, providing consistent long-term personalisation across sessions and tools.

**Stated success criterion:** >75% accuracy over a minimum of 10 multi-session interactions via REST API or MCP.

**Report alignment note:** The implementation exposes memory via:

- **MCP** (`POST /mcp` on Convex site URL)
- **Convex `authAction`s** for first-party clients (web, extension, mobile)
- **HTTP REST API** (`POST/PATCH /api/v1/memories`, `POST /api/v1/memories/retrieve`) via API keys — added May 2026
- **`@vmem/sdk`** npm package for programmatic access

The phrase "REST API" in the objective is now satisfied by the v1 HTTP routes, not a standalone Hono server (which was removed).

### 2.3 Scope Assumptions (from report)

- MCP protocol remains stable during development
- OpenAI/OpenRouter embeddings as primary embedding source
- Evaluation uses **mock/seed test data** — no real human participant data
- Single-user deployment target for prototype
- Benchmarks at hundreds to low thousands of memory units

### 2.4 Intended Beneficiaries

Report states business/power-user focus, but deliverables include end-user surfaces (extension, mobile, dashboard). The **technical differentiator** is the memory architecture (graph + hybrid retrieval + transparency), applicable to customer support, personal agents, and developer tooling.

---

## 3. Core Design Philosophy

### 3.1 Do Not Build Another Chat App

Every feature chat apps have (connectors, artifacts, code execution, automations) will eventually be built by OpenAI/Anthropic/Google. vmem's value is the **memory layer underneath** whatever interface the user chooses.

**Exception:** Minimal local chat/voice in the web app and mobile app exist so users can interact with their memories without a third-party LLM — but this is secondary to MCP integration.

### 3.2 Reading Is Implicit, Writing Is Explicit

Most memory competitors (Mem0, Supermemory) require the LLM to **explicitly call a search tool**. Problems:

- LLM may forget to check memory
- Every retrieval costs a tool-call round trip

vmem uses **MCP Resources** to inject a synthesized user profile (`vmem://context_prompt`) **before** the LLM generates. Baseline context is always present.

Explicit tools remain for intentional actions:

- `memory_add` — deliberate save
- `memory_search` — filtered lookup
- `memory_retrieve` — query-specific semantic retrieval with Context Trace

### 3.3 Graph + Vector (GraphRAG), Not Vector Alone

Memories are relational — they reference people, projects, events, other memories. Neo4j provides native traversal. Vector search alone fails at:

- Multi-hop reasoning ("what do I know about my friend's project?")
- Distinguishing semantically similar but unrelated facts ("favourite colour is orange" vs "ate an orange yesterday")

Long documents (PDFs, Word) stay as embedded wholes with graph links, not shredded into arbitrary graph nodes.

### 3.4 User Control Over Memory

Unlike competitors, users can:

- See **why** a memory was retrieved (Context Trace)
- **Approve/reject** proposed updates before facts are overwritten
- **Pin** important memories (boosted, included in context prompt)
- **Suppress** or **expire** memories
- Trace **provenance** (source, connector, import)

### 3.5 Reasoning Over Raw Storage

vmem does not just store and retrieve — it **reasons** about knowledge:

- V2 fact extraction creates structured update/delete proposals from conversations
- Dream Mode detects anomalies via surprisal scoring and synthesises insights
- Optional LLM reranking and query expansion behind feature flags

Goal: surface ~10k highly relevant pre-reasoned tokens instead of stuffing 115k tokens of raw conversation (context engineering).

---

## 4. Architectural Evolution Timeline

This chronology is critical for FYP Chapter 4 (Method) and 4.8 (Delays and Changes). Dates from `internal/changelog.md`.

### Phase 0 — Early Foundation (February 2026)

| Date       | Decision                                                              | Reasoning                                                             | Tradeoff                                                               |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 2026-02-14 | **Fastify + Postgres/pgvector** (`apps/api`)                          | Initial hybrid memory engine with SQL schema, vector search, SSE chat | Relational model fought graph-shaped memory data                       |
| 2026-02-22 | Convex `users` table + theme persistence                              | Real-time user state                                                  | —                                                                      |
| 2026-02-22 | API key encryption simplified to single `ENCRYPTION_KEY` + Web Crypto | Removed Node.js split, reduced env var complexity                     | Plain SHA-256 for key lookup (acceptable — keys have 192 bits entropy) |

### Phase 1 — Neo4j Pivot (March 2026)

| Date       | Decision                                                     | Reasoning                                                         | Tradeoff                                       |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------- |
| 2026-03-10 | **Removed Drizzle/Neon; Neo4j as memory store**              | Core data model is a graph; forcing into Postgres JOINs was wrong | Managed Aura dependency; Cypher learning curve |
| 2026-03-10 | **Hono HTTP server** on Railway                              | Lightweight API layer for frontend                                | Separate deployment, cold starts, dual auth    |
| 2026-03-10 | **Context Trace** as core differentiator                     | Transparent score breakdown on every retrieval                    | More complex retrieval pipeline                |
| 2026-03-10 | **MCP architecture decision** — implicit reads via Resources | Differentiates from Mem0 tool-only approach                       | MCP spec less mature than REST                 |
| 2026-03-11 | **Sigma.js + Graphology** for memory graph viz               | Old Canvas 2D O(n²) capped at ~100 nodes; WebGL scales to 1000+   | Added graph viz dependencies                   |
| 2026-03-15 | **Chrome extension** full implementation                     | Passive + active memory capture from browser                      | MV3 service worker complexity                  |

### Phase 2 — Convex Consolidation (April–May 2026)

| Date       | Decision                                                       | Reasoning                                                                                    | Tradeoff                                            |
| ---------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 2026-04-13 | **GitHub OAuth moved to Convex HTTP actions**                  | Eliminate Next.js API route dependency                                                       | —                                                   |
| 2026-05-04 | **MCP consolidated into Convex** (deleted Railway `apps/mcp`)  | Single deployment, no dual cold starts, tighter integration                                  | Convex action time limits (15 min max — acceptable) |
| 2026-05-04 | **MCP OAuth + PKCE** on Convex                                 | Claude/Cursor need standard OAuth flow                                                       | Required `CLERK_SECRET_KEY` on Convex deployment    |
| 2026-05-10 | **Next.js → Vite + TanStack Router**                           | Convex live queries require client-side fetching; SSR benefit lost; Vite build ~60s vs ~150s | No server components; all data fetching client-side |
| 2026-05-10 | **Hono/Railway removed** — Convex `authAction`s + HTTP actions | Reduced hosting surface, one backend                                                         | No persistent server; cold starts per invocation    |
| 2026-05-10 | **`memoryService.ts` split into 19 modules**                   | 4.4k LOC monolith unmaintainable                                                             | More files to navigate                              |
| 2026-05-20 | **Deleted legacy `apps/mcp` Railway server**                   | Fully replaced by Convex inline handlers                                                     | —                                                   |
| 2026-05-20 | **Removed `CONVEX_EVENT_SECRET`** event bus                    | Leftover from Hono era                                                                       | —                                                   |

### Phase 3 — Maturity (May 2026)

| Date       | Decision                                                                                         | Reasoning                                                  | Tradeoff                                                     |
| ---------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------ |
| 2026-05-22 | **Hybrid retrieval improvements** — parallel legs, graph RRF, entity match, MMR, optional rerank | Better recall quality                                      | Complexity; eval showed 0.0 until seed data present in Neo4j |
| 2026-05-22 | **HTTP v1 API routes** with API key auth                                                         | Programmatic access outside Clerk SDK                      | Keys encrypted at rest; usage metered                        |
| 2026-05-22 | **`@vmem/sdk` published**                                                                        | Official JS client with agentic `store/update/retrieve`    | Requires OpenRouter key for instruction mode                 |
| 2026-05-22 | **MCP uses canonical memory handlers**                                                           | Fixed dedup/chunking/V2 drift between MCP and UI paths     | —                                                            |
| 2026-05-22 | **Chrome extension reliable background sync**                                                    | MV3 SW eviction broke auth; offscreen then storage.session | Extension auth is fragile in dev                             |

### Original PDD vs Final Architecture

| PDD Plan            | Final Implementation              | Why Changed                                      |
| ------------------- | --------------------------------- | ------------------------------------------------ |
| Next.js frontend    | Vite + TanStack Router SPA        | Convex reactivity requires client; SSR unused    |
| Hono API on Railway | Convex authActions + HTTP actions | Fewer deployments; colocated with auth/settings  |
| Postgres + pgvector | Neo4j with native vector indexes  | Graph model is primary; vectors co-located       |
| Standalone REST API | Convex SDK + MCP + v1 HTTP routes | REST exists but not as separate server           |
| Local enrichment    | Server-side OpenRouter enrichment | Local LLM enrichment too unpredictable on laptop |

---

## 5. Current System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLIENTS                                                                 │
│  ┌────────────┐  ┌─────────────────┐  ┌─────────┐  ┌────────────────┐ │
│  │ Web App    │  │ Chrome Extension │  │ Mobile  │  │ MCP Clients    │ │
│  │ (Vite SPA) │  │ (MV3)           │  │ (Expo)  │  │ Claude/Cursor  │ │
│  └─────┬──────┘  └────────┬────────┘  └────┬────┘  └───────┬────────┘ │
│        │                  │                 │               │          │
│        │ Convex SDK       │ ConvexHttpClient│ Convex SDK    │ MCP HTTP │
│        │ + Clerk JWT      │ + Clerk JWT     │ + Clerk       │ OAuth JWT│
└────────┼──────────────────┼─────────────────┼───────────────┼──────────┘
         │                  │                 │               │
         └──────────────────┴─────────────────┴───────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │  Convex (Control Plane)       │
                    │  • Clerk auth / user bootstrap│
                    │  • authAction / authMutation  │
                    │  • MCP HTTP (/mcp)            │
                    │  • HTTP v1 API (/api/v1/*)    │
                    │  • OAuth callbacks            │
                    │  • Settings, profiles, teams  │
                    │  • Connector token storage    │
                    │  • Context prompt cache       │
                    │  • File storage, wiki, skills │
                    │  • Scheduling (Dream Mode)    │
                    └───────────────┬───────────────┘
                                    │ internalAction ("use node")
                    ┌───────────────▼───────────────┐
                    │  Neo4j Aura (Memory Graph)    │
                    │  • :Memory nodes + embeddings │
                    │  • Tags, entities, chunks     │
                    │  • RELATES_TO graph edges     │
                    │  • Proposed updates           │
                    │  • Codebase symbol graph      │
                    │  • Fulltext + vector indexes  │
                    └───────────────────────────────┘
```

### Data Flow Summary

**Write path:**

1. Client → `memoryApi.createMemory` (Convex authAction)
2. Verify Clerk identity → resolve active profile
3. Neo4j internal action → 4-layer dedup → create node → embed → chunk → enrich → V2 fact extraction
4. Schedule context prompt regeneration (60s debounce)
5. Return memory with tags

**Read path (explicit retrieve):**

1. Client → `memoryApi.retrieveMemories`
2. Embed query (OpenRouter, user-provided key)
3. Neo4j parallel legs → RRF fusion → graph expansion → score → MMR → optional rerank
4. Return ranked memories + Context Trace + parallel `userContext` (aboutMe, preferences)

**Read path (implicit MCP):**

1. MCP client reads `vmem://context_prompt` Resource at conversation start
2. Returns cached markdown profile (about, preferences, pinned memories, LLM summary)
3. LLM sees context without tool call

---

## 6. Technology Stack and Decision Tradeoffs

### Frontend

| Technology                | Role                     | Why Chosen                                          | Tradeoff                 |
| ------------------------- | ------------------------ | --------------------------------------------------- | ------------------------ |
| **Vite 8**                | Web build tool           | Fast dev HMR, 60s production builds vs 150s Next.js | No SSR                   |
| **TanStack Router**       | File-based routing       | Type-safe routes, code splitting                    | Client-only data loading |
| **React 19**              | UI framework             | Ecosystem, Convex React bindings                    | —                        |
| **Tailwind CSS 3**        | Styling                  | Utility-first, design tokens                        | —                        |
| **nuqs**                  | URL state for filters    | Shareable filter URLs, no local state for filters   | —                        |
| **Clerk**                 | Authentication           | OAuth, JWT templates for Convex                     | Vendor dependency        |
| **Sigma.js + Graphology** | Memory graph viz         | WebGL, 1000+ nodes                                  | Heavy bundle             |
| **TipTap**                | Wiki editor              | Rich markdown editing                               | —                        |
| **WebLLM / MediaPipe**    | Local browser LLM        | Privacy for chat/voice                              | Requires WebGPU          |
| **@vmem/ui**              | Shared component library | shadcn/Radix primitives + AI chat elements          | —                        |

### Backend

| Technology          | Role                              | Why Chosen                                           | Tradeoff                            |
| ------------------- | --------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| **Convex**          | Serverless backend + real-time DB | Live queries, HTTP actions, scheduling, file storage | Action time limits; cold starts     |
| **Neo4j Aura**      | Memory graph database             | Native graph traversal + vector indexes              | Cost at scale; Cypher expertise     |
| **OpenRouter**      | Embeddings + LLM calls            | User-owned API keys, model choice, cost logging      | Requires user key for full features |
| **MCP SDK**         | AI tool protocol                  | Standard cross-model integration                     | Evolving spec                       |
| **Zod v4**          | Validation                        | Runtime type safety at API boundaries                | —                                   |
| **pnpm workspaces** | Monorepo                          | Shared packages, catalog dependencies                | —                                   |

### Infrastructure

| Service                  | Purpose                            |
| ------------------------ | ---------------------------------- |
| **Vercel**               | Web app hosting                    |
| **Convex Cloud**         | Backend hosting                    |
| **Neo4j Aura Free Tier** | Graph database                     |
| **Clerk**                | Auth provider                      |
| **GitHub Actions**       | CI, extension release, SDK publish |
| **Mintlify**             | Documentation site (`apps/docs`)   |

### Embeddings

- Model: `openai/text-embedding-3-small` via OpenRouter
- Dimensions: 1536
- Stored on `:Memory` nodes and `:Chunk` nodes in Neo4j vector indexes

### LLM Models (server-side, when user provides OpenRouter key)

- Default: `qwen/qwen3-235b-a22b-2507` for fact extraction, Dream Mode, context prompt summary, SDK instruction mode, optional reranking

---

## 7. Monorepo Layout and Scale

```
vmem/
├── apps/
│   ├── web/                 # Vite + TanStack Router dashboard (~36k LOC)
│   ├── chrome-extension/    # MV3 extension (~5k LOC)
│   ├── mobile/              # Expo React Native (~2.5k LOC)
│   └── docs/                # Mintlify documentation
├── packages/
│   ├── backend/             # Convex functions + Neo4j service layer
│   │   ├── convex/          # Convex schema, actions, HTTP routes
│   │   └── src/neo4j/       # Neo4j free-function modules
│   ├── ui/                  # Shared UI components (~4k LOC)
│   └── sdk/                 # @vmem/sdk HTTP client
├── internal/
│   ├── changelog.md         # Detailed change history
│   └── plans/               # Implementation plans (implemented + todo)
├── CLAUDE.md                # AI agent coding rules
└── AGENTS.md                # Same rules for agents
```

**Package manager:** pnpm 10.15.1 with catalog dependencies  
**Pre-commit:** Husky + lint-staged + Prettier

---

## 8. Convex Control Plane (Operational Data)

**Critical architectural rule:** Memories are **NOT** stored in Convex. Convex holds everything except the memory graph itself.

### 8.1 Schema Tables (`packages/backend/convex/schema.ts`)

| Table                    | Purpose                                                                    |
| ------------------------ | -------------------------------------------------------------------------- |
| `users`                  | Clerk-mapped identity (clerkId, email, name)                               |
| `apiKeys`                | Encrypted API keys for HTTP v1 access (hash + AES-GCM encrypted full key)  |
| `connectors`             | External data source connections (Google Drive, Notion, OneDrive, Linear)  |
| `connectorTokens`        | Encrypted OAuth access/refresh tokens                                      |
| `userSettings`           | Preferences, aboutMe, preferences, Dream Mode schedule, extension settings |
| `profiles`               | Memory workspaces (personal or team-linked)                                |
| `teams` / `teamMembers`  | Team workspaces with role-based access                                     |
| `notifications`          | In-app notifications                                                       |
| `oauthStates`            | CSRF state for OAuth flows                                                 |
| `githubConnections`      | GitHub OAuth for codebase sync                                             |
| `chatMessageMemoryRefs`  | Persisted memory citation traces in chat UI                                |
| `codebases`              | Synced GitHub repo metadata                                                |
| `skills`                 | User-authored agent skill modules (markdown instructions)                  |
| `wikiNodes`              | Wiki folder/document tree                                                  |
| `userEnvVars`            | Encrypted per-user env vars (e.g. OPENROUTER_API_KEY)                      |
| `openRouterLogs`         | LLM call cost/latency/token accounting                                     |
| `contextPromptCache`     | Cached MCP context prompt markdown                                         |
| `mcpAuthCodes`           | Short-lived MCP OAuth authorization codes (5 min, PKCE)                    |
| `mcpClientRegistrations` | Dynamic OAuth client registrations (24h)                                   |

### 8.2 Auth Pattern (`convex/auth.ts`)

- `authQuery`, `authMutation`, `authAction`, `authInternalAction` — inject `ctx.userId` from Clerk
- `requireClerkId(ctx)` — maps Convex user → Clerk subject string used as Neo4j `Memory.userId`
- `ensureUserExists` — auto-creates user + default "Personal" profile on first sign-in

**Identity mapping:**

- Convex internal: `users._id` (Id<"users">)
- Neo4j graph: Clerk `subject` string (e.g. `user_39IXNJeQM9vlRyQ9IdCvKbsqsti`)

### 8.3 Validators Single Source of Truth

Field definitions exported as `const xxxFields = { ... }` in `validators.ts`, used in both `schema.ts` and return validators. Never duplicate field definitions.

---

## 9. Neo4j Memory Graph (Source of Truth for Memories)

### 9.1 Node Labels

| Label                                                        | Key Properties                                                                                                                               | Purpose                                           |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `:Memory`                                                    | id, userId, title, content, type, source, status, confidence, embedding, profileId, contentHash, sourceType, sourceId, expiresAt, visitCount | Core memory unit                                  |
| `:Tag`                                                       | name (globally unique)                                                                                                                       | Categorisation                                    |
| `:Source`                                                    | name (globally unique)                                                                                                                       | Provenance (manual, mcp, chatgpt, connector name) |
| `:Entity`                                                    | normalizedName, type, userId, memoryCount                                                                                                    | LLM-extracted named entities                      |
| `:Chunk`                                                     | id, content, embedding, position                                                                                                             | Paragraph-level chunks for long memories          |
| `:ProposedUpdate`                                            | id, kind, status, proposedContent, confidence                                                                                                | Pending user review items                         |
| `:MemoryEvent`                                               | action, timestamp, metadata                                                                                                                  | Audit trail per memory                            |
| `:CodeFile`, `:Function`, `:Class`, `:Interface`, `:Process` | —                                                                                                                                            | Codebase symbol graph (separate domain)           |

### 9.2 Relationships

| Relationship   | From → To                      | Purpose                              |
| -------------- | ------------------------------ | ------------------------------------ |
| `TAGGED_WITH`  | Memory → Tag                   | Tags                                 |
| `FROM_SOURCE`  | Memory → Source                | Provenance                           |
| `RELATES_TO`   | Memory → Memory                | Semantic/graph links (reason, score) |
| `MENTIONS`     | Memory → Entity                | Named entity extraction              |
| `HAS_CHUNK`    | Memory → Chunk                 | Long memory chunking                 |
| `DERIVED_FROM` | Memory/ProposedUpdate → Memory | Dream synthesis lineage              |
| `UPDATE_FOR`   | ProposedUpdate → Memory        | V2 update/delete target              |
| `EVENT_FOR`    | MemoryEvent → Memory           | Audit events                         |

### 9.3 Memory Types

| Type        | Semantics                           | Recency Behaviour                     |
| ----------- | ----------------------------------- | ------------------------------------- |
| `profile`   | Stable user facts and preferences   | **Never decays** in retrieval scoring |
| `episodic`  | Session-specific or temporal events | Standard recency decay                |
| `knowledge` | Learned information and skills      | Slower decay (0.2 lift cap)           |

### 9.4 Memory Status

| Status       | Behaviour                                                           |
| ------------ | ------------------------------------------------------------------- |
| `active`     | Normal state, included in retrieval                                 |
| `pinned`     | Protected from expiry; up to 20 included verbatim in context prompt |
| `suppressed` | Hidden from retrieval but not deleted                               |
| `expired`    | Past expiry date; excluded from retrieval                           |

### 9.5 Indexes and Constraints (`src/neo4j/setup.ts`)

**Constraints (unique):** memory_id, tag_name, source_name, proposed_update_id, chunk_id, entity_user_name_type

**Indexes:** userId, type, status, composites for profile/filter queries, contentHash for dedup

**Fulltext:** `memory_content` on [title, content]; `chunk_content` on chunk text

**Vector:** `memory_embedding` (1536-dim cosine); `chunk_embedding` (1536-dim cosine)

### 9.6 Neo4j Session Rule (Critical)

**Never run parallel `session.run()` calls on the same session.** Each concurrent retrieval leg opens its own session. Documented throughout retrieve.ts and graph code. Violation causes driver errors under load.

---

## 10. Memory Lifecycle — End to End

### 10.1 Create (`neo4jActions/memories/create.ts`)

**Entry points:** `memoryApi.createMemory`, MCP `memory_add`, HTTP `POST /api/v1/memories`, connector sync, extension capture, SDK `store(instruction)`

**4-layer deduplication pipeline (in order):**

1. **External ID** — `(userId, sourceType, sourceId)` match → bump visitCount, return existing
2. **URL** — same URL from same source → merge
3. **Title + origin** — same title from same source type → merge
4. **Content hash** — SHA-256 of normalised content → merge
5. **Semantic** — cosine similarity ≥ 0.95 → merge

On dedup hit: increment `visitCount`, transfer any new tags, return existing memory (idempotent).

**Post-create fan-out (scheduled/async):**

1. Generate embedding (OpenRouter, user key)
2. Chunk if content > 2KB (`chunkMemoryInternal`)
3. LLM enrichment — auto-tags, RELATES_TO links (up to 5 similar memories ≥ 0.78 cosine), MENTIONS entities
4. V2 fact extraction — may create ProposedUpdate nodes for conflicts
5. Mark context prompt cache stale (60s debounced regeneration)

### 10.2 Read

| Operation | Function            | Description                                                               |
| --------- | ------------------- | ------------------------------------------------------------------------- |
| Get one   | `getMemory`         | Single memory by ID                                                       |
| List      | `listMemories`      | Paginated with filters (profile, type, status, source, tags, searchQuery) |
| Search    | `searchMemories`    | Filter/search without hybrid ranking                                      |
| Retrieve  | `retrieveMemories`  | Hybrid semantic retrieval with Context Trace                              |
| Graph     | `getGraphData`      | Nodes + edges for visualisation                                           |
| Timeline  | `getMemoryTimeline` | Audit history                                                             |

### 10.3 Update

- Direct field update via `updateMemory` / MCP `memory_update`
- V2 instruction-based update via SDK/HTTP `{ instruction }` mode
- Conflict updates route through ProposedUpdate queue (user approval required unless Dream Mode auto-accept)

### 10.4 Delete

- Single: `deleteMemory` / MCP `memory_delete`
- All: `deleteAllMemories` — DETACH DELETE memories, chunks, events, proposals, entities; prune orphan tags/sources

### 10.5 Deduplication (Maintenance)

`deduplicateMemories` and `deduplicateBrowsingHistory` — one-off admin actions that merge duplicate groups by contentHash or title, transfer edges, delete duplicates. Idempotent.

---

## 11. Hybrid Retrieval Pipeline (Core Technical Contribution)

**Files:**

- Core: `packages/backend/src/neo4j/memory/retrieve.ts` (~840 LOC)
- Orchestration: `packages/backend/convex/neo4jActions/memories/read.ts`

### 11.1 Pipeline Flow

```
Query text
    ↓
Embed query (OpenRouter text-embedding-3-small) — skipped if no API key
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 4 PARALLEL LEGS (separate Neo4j sessions each)              │
│  1. Fulltext (BM25 via Neo4j fulltext index)                │
│  2. Whole-memory vector (memory_embedding index)            │
│  3. Chunk vector (chunk_embedding index, joins parent)      │
│  4. Entity overlap (MENTIONS + token/bigram match)          │
└─────────────────────────────────────────────────────────────┘
    ↓
Merge ranks → Graph expansion (top 5 RRF seeds)
    ↓
Graph leg: 1-hop RELATES_TO, shared Entity, 2-hop RELATES_TO
    ↓
RRF fusion across all 5 rank lists
    ↓
Final score = RRF×0.55 + recency×0.225 + confidence×0.225
    ↓
MMR diversity (λ=0.7 relevance, 0.3 diversity) — if embedding exists
    ↓
Optional LLM rerank (top 30, VMEM_ENABLE_RERANK=1)
    ↓
Return top-K with Context Trace per result
```

### 11.2 RRF (Reciprocal Rank Fusion)

`rrfScore(rank, k=60) = 1 / (60 + rank)`

Leg weights:

- Fulltext, vector, entity: weight 1.0
- Chunk: weight 0.85 (`CHUNK_RRF_WEIGHT`)
- Graph: weight 0.85 (`GRAPH_RRF_WEIGHT`)

### 11.3 Context Trace (Response Shape)

Every retrieved memory includes:

```json
{
  "trace": {
    "score": 0.87,
    "reason": "Strong vector match + recent update",
    "scoreBreakdown": {
      "fulltext": 0.3,
      "vector": 0.85,
      "chunk": 0.0,
      "entity": 0.1,
      "rrf": 0.72,
      "recency": 0.9,
      "confidence": 0.95,
      "graphPath": { "hops": 1, "seedId": "...", "bridgingEntity": "..." },
      "rerankerScore": 8.5
    }
  },
  "matchedChunk": { "content": "...", "position": 0 }
}
```

**Why this matters for FYP:** Directly addresses the "black box retrieval" problem vs Mem0/Supermemory. Users and developers can debug wrong results.

### 11.4 Feature Flags

| Flag                          | Default | Effect                                                              |
| ----------------------------- | ------- | ------------------------------------------------------------------- |
| `VMEM_ENABLE_QUERY_EXPANSION` | off     | LLM generates 2 paraphrases, embeds each, merges vector/chunk ranks |
| `VMEM_ENABLE_RERANK`          | off     | LLM scores top 30 candidates 0–10                                   |

Both use existing logged OpenRouter client. No extra LLM calls by default.

### 11.5 Graceful Degradation

Without user OpenRouter key:

- Fulltext-only retrieval (no vector/chunk/MMR legs)
- No context prompt LLM summary section
- No SDK instruction mode (returns 422)
- Embeddings skipped on create (can backfill later)

---

## 12. Context Prompt and Implicit Memory (MCP Resources)

### 12.1 Resource URI

`vmem://context_prompt` — MIME type `text/markdown`

### 12.2 Content Structure

1. `# vmem User Profile`
2. `## About` — from `userSettings.aboutMe`
3. `## Preferences` — from `userSettings.preferences`
4. `## Pinned Memories` — up to 20 verbatim pinned memory contents
5. `## Profile Summary` — LLM-generated prose from 50 recent memories (400 char cap each)

### 12.3 Caching Behaviour

| Scenario             | Behaviour                                                     |
| -------------------- | ------------------------------------------------------------- |
| First read, no cache | Return placeholder markdown; schedule background regeneration |
| Cache < 24h old      | Return cached content immediately                             |
| Cache > 24h old      | Return stale content; schedule refresh in background          |
| Memory write         | Mark pending; regenerate after 60s debounce                   |

**Design principle:** MCP read is always non-blocking — clients never wait on LLM generation.

### 12.4 Files

- `convex/contextPromptCache.ts` — cache CRUD
- `convex/contextPromptApi.ts` — `getContextPrompt`, `mcpGetContextPrompt`
- `convex/contextPromptActions.ts` — background regeneration

---

## 13. MCP Server Integration

### 13.1 Endpoint

```
POST https://<deployment>.convex.site/mcp
GET  https://<deployment>.convex.site/mcp  (SSE stream)
DELETE https://<deployment>.convex.site/mcp
GET  https://<deployment>.convex.site/health
```

### 13.2 MCP Tools (`convex/mcp/tools.ts`)

| Tool              | Purpose                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| `ping`            | Health check                                                                                            |
| `whoami`          | Authenticated user ID + active profile                                                                  |
| `list_profiles`   | Available profiles                                                                                      |
| `memory_search`   | Filtered search (query, type, tags, source, profileId)                                                  |
| `memory_retrieve` | Hybrid semantic retrieval with Context Trace                                                            |
| `memory_add`      | Create memory                                                                                           |
| `memory_update`   | Update memory (including status: pinned/suppressed)                                                     |
| `memory_delete`   | Permanent delete                                                                                        |
| `memory_graph`    | Interactive MCP App graph of memories (pan/zoom canvas; `structuredContent` + `ui://vmem/memory-graph`) |
| `skills_list`     | List user skills                                                                                        |
| `skills_get`      | Fetch skill by exact name                                                                               |

### 13.3 MCP Resources

| URI                     | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `vmem://context_prompt` | Synthesized user profile (implicit memory) |

### 13.4 OAuth Flow (PKCE)

1. Client registers → `POST /mcp/oauth/register` → stored in `mcpClientRegistrations`
2. Authorize → redirect to web app `/mcp/oauth/authorize` (Clerk sign-in)
3. Web app calls `mcp.oauth.authorize` → inserts `mcpAuthCodes` (5 min TTL)
4. Token exchange → `POST /mcp/oauth/token` → PKCE verify → JWT (access 30d, refresh 90d)
5. MCP requests use `Authorization: Bearer <jwt>`

**Critical deployment requirement:** `CLERK_SECRET_KEY` must be set on Convex deployment. Without it, OAuth completes but all authenticated MCP requests return 401.

### 13.5 MCP vs Competitors

| Aspect        | Mem0 / Supermemory          | vmem                              |
| ------------- | --------------------------- | --------------------------------- |
| Read pattern  | Explicit tool call required | Resource auto-injected            |
| Transparency  | Opaque similarity score     | Full Context Trace                |
| Write pattern | Tool call                   | Tool call + background extraction |
| Protocol      | Proprietary API             | Open MCP standard                 |

---

## 14. HTTP REST API and @vmem/sdk

### 14.1 Routes (Added May 2026)

| Method | Path                        | Auth               | Purpose                                           |
| ------ | --------------------------- | ------------------ | ------------------------------------------------- |
| POST   | `/api/v1/memories`          | Bearer `vmem_sk_*` | Create memory OR `{ instruction }` agentic store  |
| POST   | `/api/v1/memories/retrieve` | Bearer API key     | Hybrid retrieve; optional `{ summarize: true }`   |
| PATCH  | `/api/v1/memories`          | Bearer API key     | Update memory OR `{ instruction }` agentic update |
| GET    | `/health`                   | None               | Server status + Neo4j connection info             |

### 14.2 @vmem/sdk (`packages/sdk`)

```typescript
const vmem = new VMemory({ apiKey: "vmem_sk_...", baseUrl: "https://..." });

await vmem.store("User prefers TypeScript over JavaScript");
await vmem.update("User now prefers Rust for systems programming");
const result = await vmem.retrieve("What language does the user prefer?");
```

**Instruction mode:** Uses V2 fact extraction + retrieval + ADD/UPDATE/DELETE decisions. Requires user OpenRouter key configured in dashboard env vars.

**Published:** `@vmem/sdk` on npm with GitHub Actions publish workflow.

### 14.3 API Key Security

- Created in dashboard → Settings → API → Keys
- Stored: SHA-256 hash (lookup) + AES-256-GCM encrypted full key (reveal-on-demand)
- Usage counted per key for dashboard stats
- Revocable

---

## 15. Proposed Updates and Dream Mode

### 15.1 Proposed Updates

When V2 fact extraction or Dream Mode detects new/changed/conflicting information, it creates `:ProposedUpdate` nodes instead of silently overwriting.

| Kind                       | Source             | On Approve                                 |
| -------------------------- | ------------------ | ------------------------------------------ |
| `update`                   | V2 fact extraction | Copy proposedContent onto memory           |
| `delete`                   | V2 fact extraction | Hard-delete memory + chunks                |
| `insight`, `connection`    | Dream Mode         | Materialise new Memory + DERIVED_FROM edge |
| `contradiction`, `anomaly` | Dream Mode         | Dismiss-only (no new memory)               |

**User flow:** Review in `/inbox/proposals` → approve or reject via `proposedUpdateApi.resolveProposal`

### 15.2 Dream Mode V2

**Purpose:** Background reasoning engine that finds non-obvious patterns in recent memories.

**Pipeline per profile:**

1. Fetch last 7 days, up to 100 embedded memories
2. Compute surprisal score: `1 - mean(k-NN cosine similarity)` per memory
3. Top 10 anomalies → fetch cluster (RELATES_TO + shared Entity, max 8)
4. LLM synthesis → parse structured response
5. Dedup against pending proposals (50% source overlap threshold)
6. Confidence floor: 0.6
7. Auto-accept (if enabled) → materialise as Memory; else → ProposedUpdate

**Scheduling:**

- User-wide for personal profiles: one cron at `userSettings.dreamModeScheduleTime` (UTC HH:MM)
- Manual "Start Dreaming" button: rate-limited 1 run/hour user-wide
- Team profiles: per-profile cron (unchanged)

**Settings:** `/settings/preferences` — auto-accept toggle + daily schedule toggle + time picker

---

## 16. Connectors and External Data Ingestion

### 16.1 Implemented Providers

| Provider     | OAuth                         | Sync                      | Notes                                             |
| ------------ | ----------------------------- | ------------------------- | ------------------------------------------------- |
| Google Drive | Google OAuth (drive.readonly) | `syncGoogleDriveInternal` | Refresh token rotation                            |
| Notion       | Notion OAuth                  | `syncNotionInternal`      | Non-expiring tokens                               |
| OneDrive     | Microsoft OAuth               | `syncOneDriveInternal`    | Personal accounts; .docx via Graph `?format=text` |
| Linear       | Linear OAuth                  | `syncLinearInternal`      | Optional fullHistory sync                         |

**Stubs (UI only):** Dropbox, Slack — "Coming Soon"

**Note:** `gmail` in schema union but not in `PROVIDER_CONFIGS` — not implemented.

### 16.2 Sync Flow

1. User connects via `/settings/connectors` → OAuth callback → encrypted tokens in `connectorTokens`
2. User triggers sync → `connectorSync.startSync`
3. Decrypt token; refresh if expired
4. Fire-and-forget via retrier to provider-specific Neo4j sync action
5. Memories upserted with `sourceType`/`sourceId` for dedup
6. Progress tracked via Convex live query on connector row

### 16.3 GitHub Codebases (Separate Flow)

- GitHub OAuth via `githubConnections` (not connectors table)
- Syncs repo file tree → parses AST → `:CodeFile`, `:Function`, `:Class` nodes in Neo4j
- Visualised in `/codebases/$id` graph view

### 16.4 Import Paths (Non-Connector)

- ChatGPT / Claude / Grok / DeepSeek / Perplexity export JSON import
- Chrome extension: bookmarks, browsing history, page saves, chat exports
- Manual memory creation in dashboard
- File upload → chunk + embed

---

## 17. Web Application (apps/web)

### 17.1 Route Map

**Public:**

- `/` — Landing + Clerk sign-in (`?agent` auto sign-in for testing)
- `/mcp/oauth/authorize` — MCP OAuth gate

**Authenticated (`/_main/*`):**

| Section   | Routes                                                                      | Purpose                 |
| --------- | --------------------------------------------------------------------------- | ----------------------- |
| Workspace | `/home`, `/chat`, `/voice`, `/memories/graph`, `/memories/list`, `/teams/*` | Core usage              |
| Data      | `/files`, `/codebases/*`, `/skills`, `/wiki/*`                              | Knowledge management    |
| Account   | `/activity/*`, `/inbox/*`, `/settings/*`                                    | Logs, proposals, config |

**Settings subroutes:** preferences, profiles, models, usage, env-vars, connectors, extension, playground, api/keys, api/usage, data-controls/import|export|danger

### 17.2 Key Features

| Feature         | Implementation                                                                          |
| --------------- | --------------------------------------------------------------------------------------- |
| Memory graph    | Sigma.js WebGL, ForceAtlas2 layout, shape-differentiated nodes (memory/wiki/skill/code) |
| Memory list     | Filters via nuqs URL params (profile, type, tags, source, status)                       |
| Local chat      | WebLLM/MediaPipe + `memoryApi.retrieveMemories` RAG + Convex thread persistence         |
| Voice           | STT (transformers.js) → local LLM → TTS (kokoro-js) + Persona orb UI                    |
| Wiki            | TipTap markdown editor, folder tree                                                     |
| Command palette | ⌘K search across memories, wiki, skills                                                 |
| MCP playground  | `/settings/playground` — test tools and OAuth locally                                   |
| Dashboard       | Stats + recent activity (user-wide, not profile-filtered)                               |

### 17.3 Chat Flow (`/chat`)

1. User loads local model in `/settings/models` (WebGPU required)
2. `useLocalChat` gets/creates Convex thread
3. On send: retrieve relevant memories → compose system prompt via `memoryRagPrompt`
4. `streamText` (Vercel AI SDK) runs local inference
5. Save messages + memory refs to Convex
6. Memory citations shown under assistant messages with trace popover

### 17.4 Convex Integration Pattern

- `ConvexProviderWithClerk` in `ClientProvider.tsx`
- Heavy use of `useQuery`, `useMutation`, `useAction`
- `MemoryContext` — intentional facade combining Convex actions + TanStack Query cache
- **Rule:** Do not mirror Convex query data into useState for form inputs — bind directly to query result

---

## 18. Chrome Extension (apps/chrome-extension)

### 18.1 Architecture

- **MV3 service worker** — all API calls (API key/token never in content scripts)
- **Popup** — React + Clerk + Convex for settings/quick save/imports
- **Content scripts** — injected per-site (ChatGPT, Claude, YouTube, all URLs for selection/screenshot)
- **Build:** Custom Vite multi-entry (popup=React, background=ES module, content=IIFE)

### 18.2 Capture Features

| Feature               | Trigger                            | Handler                                             |
| --------------------- | ---------------------------------- | --------------------------------------------------- |
| Save page             | Popup, Alt+S, context menu         | Readability extract → createMemory                  |
| Save selection        | Content script selection popup     | Selected text → createMemory                        |
| Screenshot region     | Alt+Shift+S                        | Crop → upload to Convex storage → importImageMemory |
| YouTube transcript    | youtube.com content script         | Transcript → createMemory                           |
| ChatGPT/Claude export | Injected buttons                   | Export conversation via MCP prompt injection        |
| Auto-search memories  | Debounced typing in AI chats       | retrieveMemories → floating panel                   |
| Auto-capture prompts  | On submit to AI chat               | createMemory from prompt                            |
| Import bookmarks      | Popup Import tab                   | Batch createMemory                                  |
| Import history        | 30-min alarm + on startup catch-up | Incremental sync with cursor                        |

### 18.3 Auth Challenges (MV3)

- Service worker evicted after ~30s idle — listeners must register at top-level startup
- Token stored in `chrome.storage.session` (not local — JWT TTL ~60s)
- Background sync uses `ConvexHttpClient` + Clerk JWT refresh
- Dev: user must sign in on web app first for Clerk syncHost cookies

### 18.4 Dedup and Smart Tags

Extension captures can hit 4-layer dedup on backend. Visit count incremented on repeat page saves.

---

## 19. Mobile Application (apps/mobile)

### 19.1 Scope

Chat-focused — no graph, wiki, teams, or full dashboard on mobile.

### 19.2 Routes

- `(auth)/sign-in`, `sign-up`
- `(main)/index` — Chat
- `(main)/record` — Placeholder ("Coming soon")
- `(main)/settings` — Model download/management

### 19.3 Offline LLM

- `@react-native-ai/llama` — GGUF models on device
- Catalog: TinyLlama 1.1B → Mistral 7B
- Download via `@react-native-ai/llama`, track active model in SecureStore
- Chat modes: `ready` | `no_model` | `offline` | `offline_no_model`

### 19.4 Online Integration

When online: `memoryApi.retrieveMemories` enriches responses; messages persist via `api.chat.saveLocalMessages`

---

## 20. Local LLM Strategy (Privacy and Cost)

### 20.1 Three Hard Problems (from report notes)

1. **Privacy** — Personal memories are sensitive; local inference guarantees data stays on device
2. **Cost** — Cloud model per-query economics don't scale for personal memory layers
3. **Relevance** — Time decay, ranking, importance — mostly solved server-side in retrieval pipeline

### 20.2 What's Local vs Cloud

| Operation                   | Where                                | Why                                            |
| --------------------------- | ------------------------------------ | ---------------------------------------------- |
| Chat inference (web)        | Browser WebGPU (WebLLM/MediaPipe)    | Privacy                                        |
| Voice STT/TTS (web)         | Browser (transformers.js, kokoro-js) | Privacy                                        |
| Chat inference (mobile)     | On-device GGUF (llama.cpp)           | Privacy + offline                              |
| Embeddings                  | OpenRouter (user key)                | Quality; too heavy for local default           |
| Enrichment (tags, entities) | Server-side OpenRouter               | Local enrichment abandoned — too unpredictable |
| Context prompt summary      | Server-side OpenRouter               | Best-effort; placeholder without key           |
| Dream Mode / V2 extraction  | Server-side OpenRouter               | Requires capable model                         |

### 20.3 Local Enrichment Pivot

**Original plan:** Enrich memories locally in browser with downloaded LLM.

**Abandoned because:** LLM response too unpredictable on laptop, complex parsing needed, can't use smarter models locally.

**Current:** Enrichment runs server-side with OpenRouter; only a few similar memories sent for context during enrichment. Chat/voice remain local.

---

## 21. Authentication and Security Model

### 21.1 Auth Paths

| Client           | Auth Method                         | Identity Resolution                            |
| ---------------- | ----------------------------------- | ---------------------------------------------- |
| Web / Mobile     | Clerk session → Convex JWT          | `authAction` → `ctx.userId` → `requireClerkId` |
| Chrome extension | Clerk chrome-ext + ConvexHttpClient | Same Clerk subject                             |
| MCP clients      | OAuth PKCE → MCP JWT                | `verifyAccessToken` → clerkUserId              |
| HTTP v1 API      | Bearer `vmem_sk_*`                  | SHA-256 hash lookup → owner clerkId            |
| SDK              | API key via `@vmem/sdk`             | Same as HTTP v1                                |

### 21.2 Encryption at Rest

| Data                   | Protection                                         |
| ---------------------- | -------------------------------------------------- |
| Neo4j memory content   | AES-256 via Neo4j Aura platform (ISO 27001, SOC 2) |
| API keys (full)        | AES-256-GCM, `ENCRYPTION_KEY` env var              |
| API key lookup         | SHA-256 hash                                       |
| Connector OAuth tokens | AES-256-GCM                                        |
| GitHub tokens          | AES-256-GCM                                        |
| User env vars          | AES-256-GCM                                        |
| MCP JWT                | HMAC signed, not stored                            |

**Design decision:** Do NOT encrypt Neo4j node properties at application layer — would break fulltext/vector indexing and graph traversal. Platform-level encryption is the correct boundary for a retrieval system.

### 21.3 Tenant Isolation

**Critical security control:** Every Neo4j Cypher query MUST filter by `userId` (Clerk subject). Cross-user traversal is the primary risk, not encryption at rest.

Team memories: scoped by `profileId` linked to team; mutation permissions check team membership role.

### 21.4 Audit Trail

- `:MemoryEvent` nodes in Neo4j per create/update/delete
- Convex `auditLog` for API key usage, connector events, security actions
- `openRouterLogs` for LLM cost accounting
- Context Trace persisted in `chatMessageMemoryRefs` for chat citations

### 21.5 LSEPI Considerations (for FYP 6.4)

- **Privacy:** User-owned OpenRouter keys; local chat option; no training data sent to model providers (per provider policies)
- **Data minimisation:** Suppress/expire lifecycle; proposed updates before overwrite
- **OAuth scopes:** Read-only scopes for connectors (drive.readonly, etc.)
- **Ethics:** Evaluation uses mock/seed data only; no human participants

---

## 22. UI Design System Conventions

From `CLAUDE.md` — tonal surface hierarchy:

- **No shadows** on inline elements (cards, buttons, inputs)
- **Shadows only** on floating overlays (popovers, tooltips, dialogs)
- **No borders** for layout separation — use background colour contrast (`bg-muted/40`)
- **Sidebar** always darker surface; main content lighter
- **Hover:** background shift only, never border/shadow hover
- **Detail pages:** breadcrumb prop on PageContainer, not back button
- **Filters:** consolidated into single Filters dropdown with count badge; sort/view separate
- **Max ~250 lines** per client component; extract to `_components/`

---

## 23. Evaluation, Testing, and Validation

### 23.1 Retrieval Eval Harness

**Location:** `packages/backend/src/neo4j/memory/eval/`

| File                         | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `queries.ts`                 | 8 seed-derived test queries with expected memory titles |
| `run.ts`                     | Runs retrieveMemories, computes recall@5 and MRR        |
| `baseline.txt` / `after.txt` | Saved eval outputs                                      |

**Command:** `pnpm eval:retrieval` (in packages/backend)

**Metrics:**

- **recall@5** — fraction of expected titles found in top 5 results
- **MRR** — mean reciprocal rank of first relevant result

**Current status (May 2026):** Both baseline and after runs returned 0.0 because local Neo4j lacks seed eval user memories. Harness exists; needs seeded data for meaningful numbers.

**For FYP:** Run eval against seeded Neo4j (see `src/neo4j/seed.ts`) and report results honestly.

### 23.2 Testing Approach

| Type                  | Status                                      |
| --------------------- | ------------------------------------------- |
| Unit tests (Jest)     | Not present in repo                         |
| Retrieval eval script | Present                                     |
| MCP Playground        | Manual testing in web app                   |
| Postman               | Manual API/MCP exercise                     |
| GitHub Actions        | Extension release, SDK publish, code review |
| Agent browser testing | `/?agent` auto sign-in                      |

### 23.3 Suggested FYP Evaluation Plan

1. **Automated retrieval eval** — 8 queries, recall@5, MRR (after seeding Neo4j)
2. **Multi-session recall test** — 10 scripted sessions injecting facts, test MCP retrieve
3. **Qualitative demo** — Context trace UI, proposed updates flow, cross-model MCP (Claude)
4. **Performance notes** — Graph render 1000+ nodes, retrieval latency, Convex cold starts

### 23.4 Benchmark Context (from report research)

| Benchmark | Limitation for vmem eval                                                          |
| --------- | --------------------------------------------------------------------------------- |
| LoCoMo    | Too short for modern context windows; inconsistent judge                          |
| LongMem   | Needle-in-haystack for context window, not memory architecture                    |
| BEAM      | Best comprehensive benchmark but measures LLM context use, not retrieval pipeline |

vmem evaluation should measure **retrieval pipeline quality** (recall@k, trace accuracy), not just final LLM answer match.

---

## 24. Competitive Positioning

| Feature                    | Mem0                 | Supermemory | ChatGPT Memory       | vmem                          |
| -------------------------- | -------------------- | ----------- | -------------------- | ----------------------------- |
| Self-hostable              | No                   | No          | No                   | Yes (Neo4j Aura or self-host) |
| Cross-model                | API yes, transfer no | API yes     | No                   | MCP + HTTP API                |
| Graph relationships        | No (flat)            | No          | No                   | Yes (Neo4j)                   |
| Retrieval transparency     | No                   | No          | No                   | Context Trace                 |
| Conflict approval          | Limited              | No          | Limited              | Proposed updates inbox        |
| Implicit context injection | No (tool only)       | No          | Platform-native only | MCP Resource                  |
| Local LLM chat             | No                   | No          | No                   | Yes (web + mobile)            |
| Pin/suppress/expire        | Limited              | Limited     | Limited              | Full lifecycle                |

---

## 25. Known Limitations and Future Work

| Limitation                   | Detail                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| Eval data not seeded locally | recall@5/MRR report blocked until seed run                        |
| Gmail connector              | In schema but not implemented                                     |
| Export feature               | Placeholder in data-controls                                      |
| Mobile voice/record          | Stub only                                                         |
| API keys                     | Created in UI; HTTP routes exist; full REST surface still growing |
| Single-user prototype        | Teams exist but FYP scope is single-user eval                     |
| Convex action limits         | 15 min max per HTTP action                                        |
| Extension auth in dev        | Requires web app sign-in for Clerk syncHost                       |
| No unit test suite           | Eval script + manual testing only                                 |
| pgvector for documents       | Deferred — Neo4j vectors sufficient for prototype scale           |

**Future work from internal/plans/todo/:**

- Timeline replay P1/P2
- Document vector search v2
- Graph visualisation enhancements

---

## 26. FYP Report Mapping (Chapters 4 and 5)

### Chapter 4 — Method (what to write)

| Section                  | Source Material in This Doc                                |
| ------------------------ | ---------------------------------------------------------- |
| 4.1 Methodology          | §4 Architectural Evolution, RAD approach, iterative pivots |
| 4.2 Requirements         | §2 Objectives, §10 Lifecycle, §13 MCP tools, §14 HTTP API  |
| 4.3 Work Plan            | §4 Timeline phases with dates                              |
| 4.4.1 Architecture       | §5 Current Architecture diagram                            |
| 4.4.2 Frontend           | §6 Vite/TanStack decision, §17 Web app                     |
| 4.4.3 Backend            | §6 Convex decision, §8 Control plane                       |
| 4.4.4 Database           | §9 Neo4j model, §8 Convex schema split                     |
| 4.4.5 Memory data model  | §9 nodes/relationships/types/status                        |
| 4.5 Tools & Environment  | §6 stack, §7 monorepo, Husky, GitHub Actions               |
| 4.6.1 Convex backend     | §8                                                         |
| 4.6.2 Neo4j integration  | §9, §10                                                    |
| 4.6.3 Embeddings         | §6 embeddings, `lib/openRouter/embedding.ts`               |
| 4.6.4 Semantic retrieval | §11 full pipeline                                          |
| 4.6.5 MCP server         | §13                                                        |
| 4.6.6 Connectors         | §16                                                        |
| 4.6.7 Frontends          | §17, §18, §19                                              |
| 4.8 Delays/Changes       | §4 timeline table (PDD vs final)                           |
| 4.9 Testing              | §23                                                        |

### Chapter 5 — Results (what to evidence)

| Section               | Evidence to Include                                                           |
| --------------------- | ----------------------------------------------------------------------------- |
| 5.3 Design            | Architecture diagram, memory write/read flow diagrams, ERD                    |
| 5.4.1 Dev environment | VS Code, Cursor/Claude Code, Git (~1000 commits), GitHub                      |
| 5.4.2 Web app         | Screenshots: graph view, memory detail + trace, chat with citations, settings |
| 5.4.3 MCP             | Screenshot: playground, Claude connected, context_prompt resource             |
| 5.4.4 Extension       | Screenshot: popup, ChatGPT injection, page save                               |
| 5.4.5 Retrieval       | Explain 5-leg pipeline; screenshot Context Trace breakdown                    |
| 5.4.6 Evaluation      | recall@5/MRR table from eval harness; multi-session test results              |
| 5.4.7 Mobile          | Screenshot: offline chat with model download                                  |
| 5.4.8 Connectors      | Screenshot: connected Google Drive/Notion, synced memories                    |
| 5.4.9 Dream Mode      | Screenshot: proposals inbox, synthesis example                                |

### Objectives Table (Chapter 6.1)

| Objective                             | Likely Status  | Evidence                             |
| ------------------------------------- | -------------- | ------------------------------------ |
| Persistent memory server via MCP/HTTP | Fully met      | §13, §14                             |
| Cross-session memory                  | Fully met      | Neo4j persistence, extension capture |
| Cross-model access                    | Fully met      | MCP OAuth works with Claude/Cursor   |
| >75% recall accuracy                  | **Needs eval** | Run §23 eval with seeded data        |
| Graph-based relationships             | Fully met      | §9 RELATES_TO, entity graph          |
| User inspectable retrieval            | Fully met      | §11.3 Context Trace                  |
| Store/retrieve/update                 | Fully met      | §10 lifecycle                        |

---

## 27. Key File Index

### Backend Core

| Path                                                      | Purpose                            |
| --------------------------------------------------------- | ---------------------------------- |
| `packages/backend/convex/schema.ts`                       | Convex schema                      |
| `packages/backend/convex/validators.ts`                   | Shared field definitions           |
| `packages/backend/convex/auth.ts`                         | Clerk auth builders                |
| `packages/backend/convex/memoryApi.ts`                    | Public memory API barrel           |
| `packages/backend/convex/memoryApi/personal.ts`           | Personal memory handlers           |
| `packages/backend/convex/http.ts`                         | HTTP route registration            |
| `packages/backend/convex/http/v1Memories/`                | REST API handlers                  |
| `packages/backend/convex/mcp/native.ts`                   | MCP HTTP handler                   |
| `packages/backend/convex/mcp/tools.ts`                    | MCP tool definitions               |
| `packages/backend/convex/mcp/resources.ts`                | MCP resources                      |
| `packages/backend/convex/mcp/oauth.ts`                    | MCP OAuth mutations                |
| `packages/backend/convex/contextPromptApi.ts`             | Context prompt read/regen          |
| `packages/backend/convex/proposedUpdateApi.ts`            | Proposal inbox API                 |
| `packages/backend/convex/connectorOAuth.ts`               | Connector OAuth configs            |
| `packages/backend/convex/connectorSync.ts`                | Sync orchestration                 |
| `packages/backend/convex/neo4jActions/memories/create.ts` | Create + dedup pipeline            |
| `packages/backend/convex/neo4jActions/memories/read.ts`   | Read/search/retrieve orchestration |
| `packages/backend/convex/neo4jActions/agent/`             | SDK instruction mode agents        |
| `packages/backend/src/neo4j/memory/retrieve.ts`           | Hybrid retrieval core              |
| `packages/backend/src/neo4j/memory/crud.ts`               | Neo4j CRUD                         |
| `packages/backend/src/neo4j/memory/proposals.ts`          | Proposed update resolution         |
| `packages/backend/src/neo4j/memory/dreamMode.ts`          | Dream Mode synthesis               |
| `packages/backend/src/neo4j/setup.ts`                     | Indexes and constraints            |
| `packages/backend/src/neo4j/seed.ts`                      | Test data seeder                   |
| `packages/backend/src/neo4j/memory/eval/run.ts`           | Retrieval evaluation               |
| `packages/backend/src/sdkPrompt.ts`                       | SDK retrieve summary prompts       |
| `packages/backend/convex/lib/crypto.ts`                   | AES-GCM encryption                 |
| `packages/backend/convex/lib/openRouter/`                 | LLM + embedding clients            |

### Frontend

| Path                                      | Purpose                           |
| ----------------------------------------- | --------------------------------- |
| `apps/web/src/routes/`                    | TanStack Router file-based routes |
| `apps/web/src/components/MemoryGraph.tsx` | Graph visualisation               |
| `apps/web/src/components/Chat.tsx`        | Local LLM chat                    |
| `apps/web/src/components/VoiceClient.tsx` | Voice chat                        |
| `apps/web/src/lib/local-engine.ts`        | WebLLM/MediaPipe routing          |
| `apps/chrome-extension/src/background/`   | Service worker + sync             |
| `apps/mobile/src/useChatProvider.ts`      | Mobile chat + RAG                 |
| `packages/sdk/src/`                       | @vmem/sdk client                  |
| `packages/ui/src/`                        | Shared components                 |

### Documentation

| Path                          | Purpose                      |
| ----------------------------- | ---------------------------- |
| `apps/docs/`                  | Mintlify public docs         |
| `internal/changelog.md`       | Detailed change history      |
| `internal/plans/implemented/` | Feature implementation plans |
| `README.md`                   | Quick start                  |
| `encryption-at-rest.md`       | Security notes for report    |
| `CLAUDE.md`                   | Coding conventions           |

---

## 28. Glossary

| Term                | Definition                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| **LLM**             | Large Language Model (ChatGPT, Claude, Gemini, etc.)                                |
| **MCP**             | Model Context Protocol — open standard for AI tool/data integration                 |
| **Context Trace**   | Per-memory score breakdown explaining why it was retrieved                          |
| **RRF**             | Reciprocal Rank Fusion — combines multiple ranked lists without score normalisation |
| **GraphRAG**        | Retrieval combining graph traversal with vector search                              |
| **Profile**         | Memory workspace bucket (personal or team); not a route prefix                      |
| **Proposed Update** | Pending memory change awaiting user approval                                        |
| **Dream Mode**      | Background reasoning engine finding patterns in recent memories                     |
| **Context Prompt**  | Synthesized markdown user profile injected via MCP Resource                         |
| **Dedup**           | 4-layer duplicate detection on memory create                                        |
| **Chunk**           | Paragraph-level segment of long memory for passage retrieval                        |
| **Entity**          | Named entity extracted from memory content (person, place, etc.)                    |
| **authAction**      | Convex function builder requiring Clerk authentication                              |
| **Clerk subject**   | String user ID used as Neo4j `Memory.userId`                                        |
| **Implicit memory** | Context injected before LLM responds (no tool call)                                 |
| **Explicit memory** | Context fetched via tool call (memory_retrieve, memory_search)                      |
| **Surprisal score** | Dream Mode metric: how unlike nearby memories a memory is                           |
| **Context rot**     | LLM performance degradation when context window is near capacity                    |
| **MV3**             | Chrome Manifest V3 extension platform                                               |
| **WebGPU**          | Browser API required for local LLM inference on web                                 |

---

## Appendix A — HTTP and MCP Quick Reference

### MCP Tools (explicit actions)

- `memory_add`, `memory_search`, `memory_retrieve`, `memory_update`, `memory_delete`
- `ping`, `whoami`, `list_profiles`, `skills_list`, `skills_get`

### MCP Resources (implicit context)

- `vmem://context_prompt`

### HTTP v1 (API key)

- `POST /api/v1/memories` — create or `{ instruction }` store
- `POST /api/v1/memories/retrieve` — retrieve or `{ summarize: true }`
- `PATCH /api/v1/memories` — update or `{ instruction }` update

### Convex SDK (Clerk auth)

- `api.memoryApi.createMemory`, `listMemories`, `retrieveMemories`, `updateMemory`, `deleteMemory`, etc.

---

## Appendix B — Report Framing Corrections

When writing the FYP report, use these accurate framings:

1. **"REST API or MCP"** → Implemented as MCP HTTP endpoint + Convex SDK + HTTP v1 API routes (not standalone Hono/Fastify server)

2. **"Graph database + vector database"** → Neo4j provides both graph traversal and vector indexes in one database (not separate Pinecone/pgvector)

3. **"Business use case focus"** → Teams feature exists; primary demo/evidence can still use personal memory use cases

4. **"Local enrichment"** → Pivoted to server-side OpenRouter enrichment; local LLM retained for chat/voice inference only

5. **Three core memory operations** → Store (`memory_add`), Retrieve (`memory_retrieve` + implicit Resource), Update (`memory_update` + proposed updates flow)

---

# Part II — Deep Implementation Reference

---

## 29. Extended Development Chronology (Month-by-Month)

This section expands §4 with finer-grained milestones from `internal/changelog.md`. Use for FYP §4.3 Work Plan and §4.8 Delays and Changes.

### February 2026 — Foundation and Design System

| Date       | Milestone                     | Detail                                                                                 |
| ---------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| 2026-02-14 | Hybrid memory engine v0       | `apps/api` Fastify + Postgres/pgvector: memories, tags, embeddings, chat SSE, API keys |
| 2026-02-22 | Theme persistence             | `users.theme` in Convex; `ThemeContext` syncs across devices                           |
| 2026-02-22 | API key crypto simplification | Single `ENCRYPTION_KEY`; Web Crypto AES-256-GCM; removed HMAC pepper                   |
| 2026-02-22 | React Hook Form migration     | Memory forms migrated from manual useState to RHF + Zod schemas                        |
| 2026-02-23 | Glass design system port      | OKLCH glass tokens from vibot; 10 UI components updated                                |

### March 2026 — Neo4j Pivot and Core Engine

| Date       | Milestone                         | Detail                                                                  |
| ---------- | --------------------------------- | ----------------------------------------------------------------------- |
| 2026-03-10 | **Neo4j replaces Postgres**       | Removed Drizzle/Neon; graph-native memory model                         |
| 2026-03-10 | Hono API + MemoryService          | CRUD, fulltext search, Context Trace retrieval, ProposedUpdate workflow |
| 2026-03-10 | MCP architecture doc              | Decision: implicit reads via Resources, explicit writes via Tools       |
| 2026-03-11 | Sigma.js graph rewrite            | WebGL replaces Canvas 2D; 1000+ node capacity                           |
| 2026-03-15 | Chrome extension v1               | Save page, export chats, use vmem, import bookmarks/history             |
| 2026-03-21 | Extension dedup + smart tags plan | Adopted mem0-style extraction patterns into vmem dedup                  |

### April 2026 — Feature Expansion and UX

| Date       | Milestone                  | Detail                                                                  |
| ---------- | -------------------------- | ----------------------------------------------------------------------- |
| 2026-04-13 | GitHub OAuth → Convex HTTP | Codebase sync callback on `*.convex.site`                               |
| 2026-04-26 | Activity vs Inbox split    | Passive logs (`/activity`) vs attention queue (`/inbox`)                |
| 2026-04-26 | Tab subroutes              | Real routes for activity/inbox/settings-api tabs (browser back/forward) |
| 2026-04-27 | Dream Mode user-wide       | Schedule + auto-accept moved from per-profile to `userSettings`         |
| 2026-05-02 | Screenshot region capture  | Alt+Shift+S → crop → Convex storage → image memory                      |
| 2026-05-04 | Memories tags → list view  | `/memories/tags` merged into `/memories/list?view=tags`                 |

### May 2026 — Consolidation, MCP, SDK, Retrieval

| Date       | Milestone                  | Detail                                                                     |
| ---------- | -------------------------- | -------------------------------------------------------------------------- |
| 2026-05-04 | MCP → Convex inline        | Deleted Railway `apps/mcp`; OAuth PKCE on Convex                           |
| 2026-05-10 | Major refactors            | memoryApi, profiles, teams, openRouter, connectorSync, memoryService split |
| 2026-05-10 | Next.js → Vite confirmed   | TanStack Router; build time reduction                                      |
| 2026-05-10 | Data controls wipe-all     | `deleteAllMemories` with type-to-confirm dialog                            |
| 2026-05-16 | Extension sync persistence | Idempotent alarms, catch-up sync on browser restart                        |
| 2026-05-20 | MCP OAuth fix              | `CLERK_SECRET_KEY` required on Convex for JWT verification                 |
| 2026-05-20 | Custom sidebar icons       | 11 animated SVG nav icons                                                  |
| 2026-05-20 | Legacy cleanup             | Removed `apps/mcp`, event bus secret, orphan enrichment module             |
| 2026-05-22 | Hybrid retrieval v2        | Parallel legs, graph RRF, entity leg, MMR, optional rerank                 |
| 2026-05-22 | HTTP v1 + `@vmem/sdk`      | API key REST routes; npm publish workflow                                  |
| 2026-05-22 | MCP handler unification    | MCP uses same `runCreateMemory` pipeline as UI                             |

---

## 30. Complete HTTP and OAuth Route Registry

**File:** `packages/backend/convex/http.ts`

| Method | Path                                      | Handler                     | Auth           | Purpose                                              |
| ------ | ----------------------------------------- | --------------------------- | -------------- | ---------------------------------------------------- |
| GET    | `/api/auth/github/callback`               | `githubCallback`            | OAuth state    | GitHub codebase OAuth return                         |
| GET    | `/api/auth/connector/callback`            | `connectorCallback`         | OAuth state    | Google/Notion/OneDrive/Linear return                 |
| POST   | `/api/v1/memories`                        | `storeMemory`               | Bearer API key | Structured create OR `{ instruction }` agentic store |
| POST   | `/api/v1/memories/retrieve`               | `retrieveMemories`          | Bearer API key | Hybrid retrieve; optional `summarize: true`          |
| PATCH  | `/api/v1/memories`                        | `updateMemory`              | Bearer API key | Structured patch OR `{ instruction }` agentic update |
| GET    | `/.well-known/oauth-authorization-server` | `oauthMetadata`             | None           | MCP OAuth discovery                                  |
| GET    | `/.well-known/oauth-protected-resource`   | `protectedResourceMetadata` | None           | MCP protected resource metadata                      |
| POST   | `/mcp/oauth/register`                     | `mcpRegister`               | None           | Dynamic client registration                          |
| GET    | `/mcp/oauth/authorize`                    | `mcpAuthorizeGet`           | Redirect       | Starts OAuth → web app Clerk flow                    |
| POST   | `/mcp/oauth/token`                        | `mcpToken`                  | PKCE           | Exchange auth code for JWT                           |
| POST   | `/mcp`                                    | `mcpHandler`                | Bearer MCP JWT | MCP JSON-RPC (tools/resources)                       |
| GET    | `/mcp`                                    | `mcpHandler`                | Bearer MCP JWT | MCP SSE stream                                       |
| DELETE | `/mcp`                                    | `mcpHandler`                | Bearer MCP JWT | Session teardown                                     |
| GET    | `/health`                                 | `mcpHealth`                 | None           | Status + Neo4j connectivity                          |

**URL patterns:**

- Convex cloud API: `https://<deployment>.convex.cloud` (SDK WebSocket)
- Convex site (HTTP): `https://<deployment>.convex.site` (MCP, OAuth, v1 API)
- Web app: `https://vmem.vedantb.com` (or local Vite dev)

---

## 31. Dedup Pipeline — Layer-by-Layer Specification

**File:** `packages/backend/convex/neo4jActions/memories/create.ts` — `runCreateMemory`

On **every** create (UI, MCP, extension, connector, SDK), dedup runs synchronously before insert. On hit: `incrementVisitCount` and return existing memory.

| Layer  | Name           | Trigger                                         | Index/Method                                     | Cost                                            |
| ------ | -------------- | ----------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| **0**  | External ID    | `externalId` + `sourceType` both set            | Composite index `(userId, sourceType, sourceId)` | O(1) lookup                                     |
| **1**  | URL            | `url` provided, normalised via `normalizeUrl()` | URL property match                               | O(1)                                            |
| **1b** | Title + origin | Source is `browsing-history` or `bookmarks`     | Same title + same URL origin                     | Handles generic titles like "vmem" on same site |
| **2**  | Content hash   | Always computed                                 | MD5 of normalised `title+content`                | Zero API cost                                   |
| **3**  | Semantic       | Only if embedding generated                     | Vector similarity ≥ **0.95** cosine              | Requires OpenRouter key                         |

**After dedup miss:**

1. `tryEmbedOne` — best-effort embedding of `title\n\ncontent` (feature tag: `memory-save`)
2. `createMemory` in Neo4j with all metadata
3. `schedulePostCreate` — async fan-out (see §32)

**Idempotency examples:**

- Re-importing same Notion page → Layer 0 hit
- Re-saving same URL → Layer 1 hit
- Extension re-capturing identical page text → Layer 2 hit
- "vmem is cool" vs "vmem is cool!" → Layer 3 hit if embedded

---

## 32. Post-Create Fan-Out and Scheduler Jobs

**Function:** `schedulePostCreate` in `create.ts`

All jobs scheduled via `ctx.scheduler.runAfter(0, ...)` — create returns immediately to caller.

| Order | Job                         | Internal action                                | Condition                                                                 |
| ----- | --------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| 1     | Audit event                 | `memoryEvents.pushEventInternal`               | Always — `memory_created`                                                 |
| 2     | Enrichment                  | `enrichment.enrichMemoryInternal`              | Always — tags, RELATES_TO, MENTIONS                                       |
| 3     | Chunking                    | `memories.chunkMemoryInternal`                 | If `shouldChunk(content)` (>2KB)                                          |
| 4     | V2 fact extraction          | `factExtraction.extractFactsAndDecideInternal` | Only if `source === "prompt-capture"` AND `sourceType !== "v2-extracted"` |
| 5     | Context prompt invalidation | `scheduleContextPromptInvalidation`            | Always — 60s debounced regen                                              |

**Recursion guard:** Facts created by V2 extraction use `sourceType: "v2-extracted"` so they don't re-trigger V2 on themselves.

---

## 33. V2 Fact Extraction Pipeline

**Purpose:** When user submits a prompt to ChatGPT/Claude (captured by extension as `prompt-capture`), extract atomic facts and reconcile against existing memories via ADD/UPDATE/DELETE/NONE decisions — inspired by mem0's conflict resolution.

**Trigger:** Post-create scheduler when `source === "prompt-capture"`

**Flow:**

1. LLM extracts facts from captured prompt text
2. For each fact: embed → `retrieveMemories` (top K) → LLM decides ADD/UPDATE/DELETE/NONE
3. **ADD** → create memory with `sourceType: "v2-extracted"`
4. **UPDATE** → create `:ProposedUpdate` (kind `update`) — user must approve
5. **DELETE** → create `:ProposedUpdate` (kind `delete`)
6. **NONE** → skip

**Same decision logic reused by SDK** `updateFromInstruction` (see §34).

**Why not on every save:** Token cost — dashboard manual saves and file uploads skip V2 unless prompt-capture path.

---

## 34. SDK Agent Mode — Instruction Store/Update/Retrieve

**Package:** `@vmem/sdk` — `packages/sdk/src/vmemory.ts`  
**Backend:** `packages/backend/convex/neo4jActions/agent/`

### store(instruction)

**HTTP:** `POST /api/v1/memories` with `{ instruction: string, profileId?: string }`

**Algorithm (`runStoreFromInstruction`):**

1. `requireOpenRouterAuth` — user's encrypted `OPENROUTER_API_KEY` from `userEnvVars`; returns 422 if missing
2. `resolveProfileIdForClerkId` — default active profile
3. `extractFactsFromInstruction` — LLM extracts durable facts from natural language
4. For each fact → `runCreateMemory` with:
   - `type: "knowledge"`, `source: "sdk-api"`, `tags: ["sdk-extracted"]`
   - `externalId: computeSdkFactExternalId(clerkId, instruction, index, text)` — SHA-256 idempotency
   - `sourceType: "sdk-extracted"`

**Returns:** `{ created: MemoryWithTags[], summary: string }`

### update(instruction)

**HTTP:** `PATCH /api/v1/memories` with `{ instruction: string }`

**Algorithm (`runUpdateFromInstruction`):**

1. Extract facts from instruction
2. For each fact:
   - Embed fact text
   - `retrieveMemories(limit: RETRIEVAL_TOP_K)` where `RETRIEVAL_TOP_K = 10`
   - `decideFactUpdate` → ADD | UPDATE | DELETE
   - ADD → immediate `runCreateMemory`
   - UPDATE → `createProposedUpdateInternal` (queued for user approval)
   - DELETE → `createProposedDeleteInternal` (queued)

**Returns:** `{ applied: MemoryWithTags[], proposals: AgentProposal[], summary: string }`

### retrieve(query)

**HTTP:** `POST /api/v1/memories/retrieve` with `{ query, limit?, summarize?: true }`

**Returns:** `{ memories: MemoryCandidate[], userContext: { aboutMe, preferences } }`  
Optional: natural-language `summary` when `summarize: true` via `runSummarizeRetrieve` + `buildRetrieveSummaryPrompt`

### Structured escape hatches

- `createMemory(input)` — direct field create (no LLM)
- `patchMemory(input)` — direct field update
- `searchMemories(input)` — alias for retrieve with structured input

---

## 35. Enrichment Pipeline (Server-Side)

**File:** `packages/backend/convex/neo4jActions/enrichment.ts`

**Model:** `qwen/qwen3-235b-a22b-2507` via OpenRouter  
**Temperature:** 0.1  
**Feature tag:** `enrichment`

**Steps:**

1. Skip silently if no `OPENROUTER_API_KEY` in user env vars
2. Fetch recent memory titles (excluding current) for relationship context
3. `buildFullEnrichmentPrompt(title, content, existingMemories)` — asks for JSON: tags, related memory IDs, entities
4. `parseFullEnrichmentResponse` — strip thinking blocks, parse JSON
5. `applyEnrichment` in Neo4j:
   - Merge tags (sanitized via `sanitizeTag`)
   - Create `RELATES_TO` edges to similar memories (with reason)
   - Create `MENTIONS` edges to `:Entity` nodes

**Automatic semantic edges:** New memories with embeddings also auto-link to up to 5 similar existing memories (threshold ≥ 0.78 cosine) during vector index query — ~10–20ms added latency.

**Local enrichment abandoned:** Originally planned browser-side LLM enrichment; moved to server because local model output too unpredictable for structured JSON parsing.

---

## 36. Scoring Mathematics and Constants

**File:** `packages/backend/src/neo4j/memory/mappers.ts` and `retrieve.ts`

### Reciprocal Rank Fusion

```
rrfScore(rank, k=60) = 1 / (60 + rank)
```

Reference: Cormack et al., SIGIR 2009. Rank is 1-indexed. Using ranks (not raw BM25/cosine scores) because scales differ between legs.

### Combined RRF (computeRrf)

```
rrf = rrf(ftRank) + rrf(vecRank) + rrf(chunkRank)×0.85 + rrf(graphRank)×0.85 + rrf(entityRank)
```

Null ranks contribute 0.

### Final composite score

```
totalScore = rrfCombined × 0.55 + recencyScore × 0.225 + confidenceScore × 0.225
```

### Recency buckets (`recencyFromAgeDays`)

| Type      | Age (days) | Score              |
| --------- | ---------- | ------------------ |
| profile   | any        | 1.0 (never decays) |
| any       | < 1        | 1.0                |
| knowledge | < 7        | 1.0                |
| knowledge | < 30       | 0.9                |
| knowledge | < 90       | 0.7                |
| knowledge | ≥ 90       | 0.5                |
| episodic  | < 7        | 0.9                |
| episodic  | < 30       | 0.7                |
| episodic  | < 90       | 0.5                |
| episodic  | ≥ 90       | 0.3                |

### MMR diversity

- `MMR_LAMBDA = 0.7` (relevance weight)
- Diversity weight = 0.3
- Uses cosine similarity between query embedding and candidate embeddings
- Greedy selection after scoring, before truncation

### Graph expansion seeds

- `TOP_N_SEEDS = 5` — top 5 by RRF enter graph expansion
- Graph neighbors ranked by `graphRank`; weighted at 0.85 in RRF

### Semantic dedup threshold

- Create-time near-duplicate: **0.95** cosine
- Enrichment auto-link: **0.78** cosine

---

## 37. Graph Expansion and Entity Leg Details

### Graph expansion (`expandViaGraph`)

From top 5 RRF seeds, find neighbors via:

1. **1-hop `RELATES_TO`** — direct memory links
2. **Shared `:Entity`** — memories mentioning same entity
3. **2-hop `RELATES_TO`** — via intermediate memory node

Each neighbor gets `graphRank` (position in sorted list). Trace includes:

- `hops`, `seedCount`, `seedId`, `bridgingEntity`

### Entity overlap leg (`runEntityLeg`)

- Tokenises query + generates bigrams
- Matches against `:Entity` nodes linked via `MENTIONS`
- Rarity-weighted when `memoryCount` on entity exists (rarer entities score higher)
- No LLM call for query entity extraction — deterministic token/bigram candidates

---

## 38. Dream Mode V2 — Algorithm Specification

**Files:** `src/neo4j/memory/dreamMode.ts`, `convex/neo4jActions/dreamMode/`

### Constants

| Parameter              | Value                       |
| ---------------------- | --------------------------- |
| Lookback window        | 7 days                      |
| Candidate pool limit   | 100 embedded memories       |
| Anomaly selection      | Top 10 by surprisal         |
| Cluster size           | Max 8 related memories      |
| Confidence floor       | 0.6                         |
| Proposal dedup overlap | 50% source overlap → skip   |
| Manual run rate limit  | 1 per hour per user         |
| LLM model              | `qwen/qwen3-235b-a22b-2507` |

### Surprisal score

```
surprisal = 1 - mean(cosineSimilarity to k nearest neighbours)
```

Higher surprisal = memory is unlike its neighbourhood = interesting for synthesis.

Uses `db.index.vector.queryNodes('memory_embedding', k, embedding)` excluding self.

### Output paths

1. **Auto-accept enabled** (`userSettings.dreamModeAutoAccept`) → `materializeSynthesisAsMemory` with `DERIVED_FROM` edges
2. **Default** → `:ProposedUpdate` kinds: `insight`, `connection`, `contradiction`, `anomaly`
3. `contradiction` / `anomaly` → dismiss-only on approve (no new memory)

### Scheduling

- **Personal profiles:** One user-wide cron at `dreamModeScheduleTime` (UTC "HH:MM")
- **Team profiles:** Per-profile cron (unchanged)
- Entry points: `runDreamForUserById`, `runDreamForActiveUser`, `runDreamForProfileById`

---

## 39. Proposed Updates — Resolution State Machine

**API:** `proposedUpdateApi.listProposedUpdates`, `resolveProposal`  
**Neo4j:** `src/neo4j/memory/proposals.ts`

```
[pending] ──approve──→ applied (memory created/updated/deleted)
         ──reject───→ dismissed
```

| Kind                       | On approve                                      |
| -------------------------- | ----------------------------------------------- |
| `update`                   | Copy `proposedContent` onto target memory       |
| `delete`                   | Hard-delete memory + chunks + dependent nodes   |
| `insight`, `connection`    | Materialise new `:Memory` + `DERIVED_FROM`      |
| `contradiction`, `anomaly` | Mark approved, no new memory (acknowledge only) |

**UI:** `/inbox/proposals` — review queue with reason text showing instruction + old/new content

---

## 40. Teams, Profiles, and Authorization Matrix

### Profiles

- **Purpose:** Organise where memories get saved (NOT route prefixes)
- Default "Personal" profile created on first sign-in
- Profile filter in list/graph via URL params (nuqs) — shareable links
- Dashboard stats always user-wide (not profile-filtered)
- `defaultProfiles` in userSettings: separate defaults for `web` vs `extension` source

### Teams

- Team has linked profile(s) for shared knowledge
- Roles: `owner`, `member`
- Team memory mutations: creator OR team owner can update/delete

| Action              | Personal profile       | Team profile          |
| ------------------- | ---------------------- | --------------------- |
| Create memory       | Any authenticated user | Team member           |
| List/get/search     | Owner                  | Team member           |
| Update memory       | Owner                  | Creator OR team owner |
| Delete memory       | Owner                  | Creator OR team owner |
| Dream Mode schedule | User-wide cron         | Per-profile cron      |

**Authorization helpers:** `assertTeamAccess`, `assertProfileAccessInternal`, `assertMemoryMutablePermission` in `teams/auth.ts`

---

## 41. Wiki, Skills, Codebases, and Files

### Wiki (`convex/wiki.ts`, `apps/web` `/wiki/*`)

- Obsidian-style folder tree in Convex `wikiNodes` table
- TipTap markdown editor per document
- Wiki nodes appear on memory graph as diamond-shaped nodes
- Separate from `:Memory` graph but visualised together

### Skills (`convex/skills.ts`, MCP `skills_list` / `skills_get`)

- User-authored markdown instruction modules for agents
- Stored in Convex, exposed via MCP tools
- Appear on graph as distinct node shape
- Exact name match for `skills_get` (case sensitive)

### Codebases (`convex/codebases.ts`, `neo4jActions/codebases.ts`)

- GitHub OAuth → sync repo file tree
- Parse with ts-morph → `:CodeFile`, `:Function`, `:Class`, `:Interface`, `:Process` in Neo4j
- Separate graph domain from memories
- Visualised in `/codebases/$id` with symbol graph

### Files (`convex/fileImport.ts`, `/files`)

- Convex file storage for uploads
- PDF parse via `pdf-parse`
- Creates memories with `storageId`, `mimeType`, `originalFilename`
- Chunk + embed long documents

---

## 42. Chat Threads and Memory RAG Integration

**File:** `packages/backend/convex/chat.ts`  
**Component:** `@convex-dev/agent` for thread/message persistence

### Thread lifecycle

- `getOrCreateThread` — one thread per user (latest), or create new
- `resetThread` — wipe messages + memory refs + create fresh thread
- Messages stored in agent component tables

### Local chat RAG flow (`apps/web` `useLocalChat.ts`)

1. User sends message
2. `memoryApi.retrieveMemories({ query: userMessage, limit: N })`
3. System prompt composed via `@vmem/backend/memoryRagPrompt`
4. `streamText` with local WebLLM/MediaPipe model
5. `saveLocalMessages` with `memoryRefs` array including full Context Trace per cited memory
6. UI shows memory badges under assistant bubbles; popover shows trace

### Voice (`VoiceClient.tsx`)

- Same thread API as chat
- Pipeline: STT (transformers.js) → retrieve + local LLM → TTS (kokoro-js)
- Persona orb animation reflects phase: idle/listening/thinking/speaking

### Mobile (`useChatProvider.ts`)

- Same pattern when online
- Offline: local Llama only, no retrieval/persist until online

---

## 43. Chrome Extension — Message Protocol and Flows

**File:** `apps/chrome-extension/src/background/message-handler.ts`

### Message types (content → background)

| Type                  | Payload                              | Action                                  |
| --------------------- | ------------------------------------ | --------------------------------------- |
| `RETRIEVE_MEMORIES`   | `{ query }`                          | `retrieveMemories` → panel display      |
| `SAVE_PAGE`           | `{ title, content, markdown?, url }` | Readability → markdown → `createMemory` |
| `SAVE_SELECTION`      | `{ selection, url, title }`          | Selection popup → create                |
| `SAVE_YOUTUBE_VIDEO`  | transcript metadata                  | Transcript → create                     |
| `CAPTURE_PROMPT`      | prompt text                          | Auto-capture on AI chat submit          |
| `SAVE_SCREENSHOT`     | cropped PNG base64 + caption         | Upload → `importImageMemory`            |
| `CAPTURE_VISIBLE_TAB` | —                                    | Full tab screenshot for region crop     |
| `IMPORT_BOOKMARKS`    | —                                    | Batch import                            |
| `IMPORT_HISTORY`      | —                                    | Incremental history sync                |
| `CANCEL_IMPORT`       | —                                    | Abort running import                    |

### Auto-sync scheduler

- **Interval:** 30 minutes (`chrome.alarms`)
- **Catch-up:** On browser start if last sync overdue
- **Auth:** `ConvexHttpClient` + Clerk JWT in `chrome.storage.session`
- **Bootstrap:** `bootstrapSyncSchedulers()` on every service worker wake

### ChatGPT/Claude content scripts

- Site-specific `selectors.ts` for DOM targets
- React controlled textarea: native setter dispatch for state update
- Debounced retrieve as user types
- Export flow: inject MCP prompt telling LLM to save via vmem tools

### Build architecture

- Popup: React + Tailwind + Clerk + Convex live
- Background: ES module, no Clerk SDK (was 81k bundle crash → 2.1k after fix)
- Content scripts: IIFE bundles per site

---

## 44. Import and Export Data Paths

### Chat export import (`/settings/data-controls/import`)

Providers: ChatGPT, Claude, Grok, DeepSeek, Perplexity, Gemini  
Flow: Upload JSON export → parse conversations → row picker → batch `createMemory`

### Extension import

- Bookmarks: one-shot bulk
- History: incremental with cursor (`lastHistorySync`)

### Connector import

- Google Drive: text/md/docx files from root
- Notion: pages → markdown
- OneDrive: txt/md/docx via Graph API
- Linear: issues → memories

### Export

- **Status:** Placeholder ("Export coming soon") at `/settings/data-controls/export`

### Danger zone

- `/settings/data-controls/danger` — type `delete all memories` to confirm wipe

---

## 45. OpenRouter Logging and Cost Accounting

**Table:** `openRouterLogs` in Convex schema

**Logged per call:**

- endpoint, model, feature tag (enrichment, context-prompt, fact-extraction, etc.)
- status, error class, tokens (prompt/completion/cached/reasoning)
- cost USD, latency ms, finish reason
- `userId`, denormalised `teamId` from profileId

**UI:** `/activity/ai-logs`, `/openrouter-logs`

**User keys:** Stored encrypted in `userEnvVars` — user pays own OpenRouter usage, not platform

**Prompt logging:** Gated on `OPENROUTER_LOG_PROMPTS=1` env var

---

## 46. Retrieval Evaluation — Full Query Set and Methodology

**Run:** `cd packages/backend && pnpm eval:retrieval`  
**Requires:** `packages/backend/.env.local` with Neo4j credentials + `OPENROUTER_API_KEY` for query embedding

### Metrics

```
recall@5 = (expected titles found in top 5) / (total expected titles)
MRR = 1 / rank_of_first_relevant  (0 if none in results)
```

### Full query set (`eval/queries.ts`)

| #   | Query                                                | Expected titles                                                                                                                                |
| --- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | strict null hooks server components                  | TypeScript strict mode benefits; React Server Components mental model; React useEffect cleanup patterns                                        |
| 2   | mcp oauth resources integration                      | Decision: MCP over REST for LLM integration; Sprint review: MCP server progress; Decided to migrate auth to Clerk                              |
| 3   | graph visualization stutter sigma canvas             | Sprint planning: graph visualization; Bug triage: graph rendering stutter; Sigma.js WebGL rendering                                            |
| 4   | Neo4j traversal batch inserts APOC GDS               | PostgreSQL vs Neo4j for graph queries; Neo4j Cypher UNWIND for batch inserts; Neo4j APOC procedures; Learning Neo4j graph data science library |
| 5   | Japan travel metro ramen Kyoto                       | Tokyo metro tip: get a Suica card; Loved the ramen in Shibuya; Kyoto temple etiquette; Japanese phrase: sumimasen                              |
| 6   | health routine deadlift running jet lag              | Started 5x5 deadlift program; Running: 5K three times a week; Jet lag strategy: no sleep on plane                                              |
| 7   | personal coding preferences dark mode vim typescript | Prefers dark mode in all editors; IDE setup: VS Code with Vim keybindings; Prefers TypeScript over JavaScript                                  |
| 8   | thesis advisor benchmarks publication defense        | Thesis advisor feedback; Goal: publish thesis by December; Thesis defense preparation; Demo prep for thesis committee                          |

**Eval user ID:** `user_39IXNJeQM9vlRyQ9IdCvKbsqsti` (must exist in Neo4j with seed data)

### Current results (May 2026)

Both baseline and post-improvement runs: **recall@5 = 0.0, MRR = 0.0** because seed memories not present in local Neo4j. Harness is valid; data seeding required.

### To get real numbers for FYP

```bash
cd packages/backend
pnpm db:seed    # populate Neo4j with test memories including eval user
pnpm eval:retrieval
```

---

## 47. Neo4j CLI Scripts (Seed, Unseed, Eval)

| Command               | Script                         | Purpose                                              |
| --------------------- | ------------------------------ | ---------------------------------------------------- |
| `pnpm db:seed`        | `src/neo4j/seed.ts`            | Populate test memories (large dataset ~650+ entries) |
| `pnpm db:unseed`      | `src/neo4j/unseed.ts`          | Remove seeded data for eval user                     |
| `pnpm eval:retrieval` | `src/neo4j/memory/eval/run.ts` | Run retrieval benchmark                              |

**Env file:** `packages/backend/.env.local`

```env
NEO4J_URI=neo4j+s://...
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
OPENROUTER_API_KEY=...   # for query embedding in eval
```

**Production Neo4j setup from Convex:**

```bash
npx convex run neo4jActions/dbSetup:ensureNeo4jSetup
```

Creates constraints, indexes, vector indexes including `chunk_embedding`.

---

## 48. Convex Components and Third-Party Integrations

| Component      | Package                      | Purpose                              |
| -------------- | ---------------------------- | ------------------------------------ |
| Agent          | `@convex-dev/agent`          | Chat threads and message persistence |
| Action retrier | `@convex-dev/action-retrier` | Connector sync retry with backoff    |
| Action cache   | `@convex-dev/action-cache`   | Cached actions where applicable      |
| Crons          | `@convex-dev/crons`          | Dream Mode scheduled runs            |
| Audit log      | `convex-audit-log`           | Security/connector audit trail       |

**External APIs used:**

- OpenRouter (embeddings + LLM)
- Google APIs (Drive OAuth + sync)
- Notion API
- Microsoft Graph (OneDrive)
- Linear API
- GitHub API (codebases)
- Clerk (auth)
- Neo4j Aura (graph)

---

## 49. Package Scripts and Developer Workflows

### Root (`package.json`)

| Script           | Action                          |
| ---------------- | ------------------------------- |
| `pnpm dev`       | Web app Vite dev server         |
| `pnpm convex`    | Convex dev (`packages/backend`) |
| `pnpm ext:dev`   | Extension watch build           |
| `pnpm ext:build` | Extension production build      |
| `pnpm mobile`    | Expo dev server                 |
| `pnpm docs:dev`  | Mintlify docs on port 3001      |
| `pnpm typecheck` | Web app TypeScript check        |
| `pnpm lint`      | Web ESLint                      |

### Backend (`packages/backend`)

| Script                | Action              |
| --------------------- | ------------------- |
| `pnpm dev`            | `npx convex dev`    |
| `pnpm deploy`         | `npx convex deploy` |
| `pnpm db:seed`        | Seed Neo4j          |
| `pnpm db:unseed`      | Unseed Neo4j        |
| `pnpm eval:retrieval` | Retrieval benchmark |

### Typecheck Convex (no dev server)

```bash
cd packages/backend && npx convex codegen --typecheck enable
```

### Agent browser testing

Navigate to `/?agent` on web app for auto sign-in as agent test user.

### Pre-commit

Husky + lint-staged + Prettier on `*.{ts,tsx,js,jsx,json,css,md}`

---

## 50. Error Handling and Degradation Matrix

| Condition                            | System behaviour                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| No OpenRouter key                    | Create works without embedding; retrieve fulltext-only; enrichment skipped; SDK instruction mode 422 |
| Embedding fails on create            | Memory still saved; semantic dedup skipped; vector leg skipped on retrieve                           |
| Chunk index missing                  | `memory_retrieve` skips chunk leg, continues other legs                                              |
| MCP JWT invalid/expired              | 401 on `/mcp`                                                                                        |
| Missing CLERK_SECRET_KEY on Convex   | OAuth succeeds but MCP requests 401                                                                  |
| Connector token expired              | Auto-refresh (Google/OneDrive); fail sync with error message on connector row                        |
| Neo4j connection stale               | Driver liveness check; connection pool tuned for Aura idle TCP drops                                 |
| LLM parse failure (enrichment)       | Logged; enrichment skipped; memory unchanged                                                         |
| Rerank/ expansion flag on + LLM fail | Falls back to pre-rerank order                                                                       |
| Extension auth missing               | Sync paused; popup shows sign-in prompt                                                              |
| Convex array limit (8192)            | Graph endpoint returns capped payload (documented in changelog)                                      |

---

## 51. How to Use This Document with Claude

### Recommended Claude Project files

1. **This file** (`FYP-PROJECT-CONTEXT.md`) — primary reference
2. **`internal/changelog.md`** — minute-level change history
3. **`encryption-at-rest.md`** — security section for LSEPI
4. **`apps/docs/architecture.mdx`** — concise architecture (cross-check)
5. **Your report draft** — for tone/consistency

### Prompt templates for report writing

**Section draft:**

> Using FYP-PROJECT-CONTEXT.md §11 and §36, write Section 5.4.5 "Hybrid Retrieval Implementation" in formal third-person academic prose, ~600 words, for a BSc FYP at City University of London. Include the RRF formula and explain why ranks are used instead of raw scores.

**Requirements table:**

> From §31, §13, §14, and §40, produce a functional and non-functional requirements table for Section 4.2 with ID, requirement, priority, and implementation evidence column.

**Evaluation section:**

> From §46 and §47, write Section 5.4.6 "Evaluation Methodology" describing recall@5 and MRR metrics, the 8-query eval set, and honestly note that results require seeded Neo4j data. Suggest a supplementary manual 10-session MCP test protocol.

**Architecture diagram caption:**

> From §5, write a figure caption and paragraph describing the three-tier architecture (Clients → Convex → Neo4j) for Appendix C.

**Objectives retrospective:**

> From §26 objectives table, expand each row into a paragraph of evidence with file references for Section 6.1.

### What Claude should NOT assume

- There is no standalone Hono/Fastify server anymore (removed)
- Memories are NOT in Convex documents
- Gmail connector is NOT implemented despite schema mention
- Eval numbers are NOT yet valid until `pnpm db:seed` + eval run
- Web app is Vite SPA, not Next.js (despite some AGENTS.md Next.js guidance for other projects)

---

_Document version: 2.0 — Part II added May 2026. Generated from codebase exploration, internal/changelog.md, apps/docs/, and project source files. For latest code state, verify against git main branch. Total: Part I (§1–28) + Part II (§29–51) + Appendices._
