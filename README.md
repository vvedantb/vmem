<!-- AI-generated (Claude), prompt: "write root readme for the vmem monorepo" -->
<!-- Modified by me: clarified problem statement and architecture overview -->

# vmem

Model-agnostic memory layer for AI: store, retrieve, update, and explain what an agent knows about a user across sessions, models, and tools.

Final Year Project, City, University of London — **Vedant Bhopatrao** (220057806). Live: [vmem-staging.vedantb.com](https://vmem-staging.vedantb.com). Source: [github.com/vvedantb/vmem](https://github.com/vvedantb/vmem).

## Quick start

1. `git clone https://github.com/vvedantb/vmem.git && cd vmem`
2. `pnpm install`
3. `cp apps/web/.env.example apps/web/.env.local` and `cp packages/backend/.env.example packages/backend/.env.local`
4. `pnpm convex` — starts Convex dev server
5. `pnpm dev` — web app at http://localhost:5173

Fill in env values first — see [Environment](#environment).

## The problem

LLMs forget between sessions. Users repeat themselves, lose personalisation on model switches, and cannot control what gets remembered. Most memory products are proprietary, single-ecosystem.

## What vmem does

Centralises user knowledge in a **Neo4j memory graph** with hybrid retrieval (fulltext + vectors + chunks + entities + graph expansion). Web, Chrome extension, MCP host, or HTTP client — all read/write through **Convex**.

**Differentiators:**

- **Context Trace** — every retrieval explains _why_ it matched (score breakdown, not a black box)
- **Proposed updates** — conflicts become reviewable proposals instead of silent overwrites
- **Implicit MCP context** — `vmem://context_prompt` injects a synthesized profile before the model responds (personal MCP only)
- **Profiles & teams** — personal and team-scoped workspaces with isolated memory graphs
- **Dream Mode** — activity-triggered and/or scheduled background synthesis that builds a user portrait and raises contradictions as proposals

## Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Web         │  │   Chrome     │  │  MCP hosts   │  │ HTTP / SDK   │
│  dashboard   │  │  extension   │  │ Claude, etc. │  │  scripts     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       └─────────────────┴────────┬────────┴─────────────────┘
                                  ▼
                    ┌─────────────────────────────┐
                    │  Convex (packages/backend)  │
                    │  auth · profiles · MCP HTTP │
                    │  connectors · files · crons │
                    └──────────────┬──────────────┘
                                   │ "use node" actions
                                   ▼
                    ┌─────────────────────────────┐
                    │  engine/ (Neo4j + parsers)  │
                    │  memory · codebase · ingest │
                    └──────────────┬──────────────┘
                                   ▼
                              Neo4j graph
```

| Layer       | Role                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| **Convex**  | Auth (Clerk), API keys, profiles, teams, connectors, file storage, MCP/HTTP endpoints, scheduled jobs            |
| **Neo4j**   | Memory nodes, tags, entities, `RELATES_TO` edges, chunk embeddings, codebase symbol graph                        |
| **engine/** | Neo4j queries, retrieval, enrichment, connector ingest, GitHub parsing — called from Convex `"use node"` actions |

## How agents integrate

Three surfaces, same memory graph:

| Surface                                        | Auth                              | Best for                               |
| ---------------------------------------------- | --------------------------------- | -------------------------------------- |
| **MCP** `https://<deployment>.convex.site/mcp` | Clerk OAuth bearer tokens         | Claude Desktop, Cursor, Windsurf, etc. |
| **HTTP API** `/api/v1/memories/*`              | `Authorization: Bearer vmem_sk_…` | Backends, scripts, CI                  |
| **`@vmem/sdk`**                                | API key                           | TypeScript/JS integrations             |

**MCP highlights:**

- **Resource:** `vmem://context_prompt` — implicit user profile (personal scope only; not on `/mcp/team`)
- **Core tools:** `ping`, `whoami`, `list_profiles`, `set_active_profile`, `context_prompt_get`
- **Domain tools:** `memory_*`, `skills_*`, `wiki_*`, `files_*`, `codebases_list`, `codebase_*`, `memory_graph` (interactive MCP App)
- **Team scope:** separate endpoint at `/mcp/team`

```typescript
import { VMemory } from "@vmem/sdk";

const vmem = new VMemory({
  apiKey: process.env.VMEM_API_KEY,
  baseUrl: process.env.VMEM_BASE_URL,
});

await vmem.save("User prefers TypeScript over JavaScript");
const { memories } = await vmem.search("What language does the user prefer?");
```

See [`packages/sdk/README.md`](packages/sdk/README.md) for full HTTP/SDK API details.

## Monorepo

pnpm workspace (`pnpm@10.15.1`). Requires Node 20+.

| Path                    | Package                  | Purpose                                                      |
| ----------------------- | ------------------------ | ------------------------------------------------------------ |
| `apps/web`              | `web`                    | Vite + React 19 + TanStack Router dashboard                  |
| `apps/chrome-extension` | `@vmem/chrome-extension` | Save pages, export chats, inject context into ChatGPT/Claude |
| `packages/backend`      | `@vmem/backend`          | Convex functions, Neo4j actions, MCP HTTP server             |
| `packages/shared`       | `@vmem/shared`           | Cross-app constants and client-safe prompt helpers           |
| `packages/ui`           | `@vmem/ui`               | Shared shadcn/Radix component library                        |
| `packages/sdk`          | `@vmem/sdk`              | Published HTTP SDK (`VMemory` class)                         |
| `oxlint-plugin-vmem/`   | (repo lint plugin)       | Custom oxlint rules for vmem conventions                     |

Apps import only `@vmem/backend`, `@vmem/shared`, and `@vmem/ui` at public exports.

## What's implemented

### Memory

- CRUD, hybrid retrieval with Context Trace, proposed-update inbox
- Memory types: `profile`, `episodic`, `knowledge` — lifecycle: `active`, `pinned`, `suppressed`, `expired`
- Server-side enrichment (OpenRouter), semantic auto-linking, file upload → memory indexing
- Memory graph view, tag filters, version history in the detail panel

### Workspaces

- Profiles as route-scoped workspaces (`/$profileId/…`)
- Teams with shared memory graph, member management, team MCP endpoint
- Inbox for proposed updates and notifications; activity log for events and AI calls

### Data & ingest

- **Files** — Convex storage + web explorer; uploads become memories
- **Codebases** — GitHub OAuth, symbol parsing, dependency graph, daily sync 04:00 UTC
- **Connectors** — Google Drive, Notion (batch ingest, daily cron)
- **Skills / Wiki** — personal skills catalogue; TipTap markdown wiki with version history
- **Import** — ChatGPT and Claude conversation exports

### Chrome extension

- Export ChatGPT/Claude conversations, save pages/screenshots/YouTube transcripts
- Inject vmem context into supported chat UIs
- Bookmark/history bulk import, configurable auto-sync

### Platform

- Clerk auth (MCP OAuth via Clerk + Dynamic Client Registration)
- AES-GCM encrypted API keys (`vmem_sk_*`), per-user OpenRouter secrets
- Activity log, OpenRouter request logs, audit trail
- Connector OAuth via Arctic (Google PKCE, Notion, GitHub)

## Run locally

Steps above under [Quick start](#quick-start). Other commands:

```bash
pnpm ext:dev         # Chrome extension WXT watch / HMR → dist/chrome-mv3-dev/
pnpm ext:build       # Chrome extension production build → dist/chrome-mv3/
pnpm typecheck:all   # web + backend + extension + packages
pnpm test            # backend + web unit tests
pnpm check           # lint + typecheck:all + knip + oxlint plugin tests + unit tests + format
pnpm eval:bench      # bench user only — seeds, reports, cleans up (safe on shared Neo4j)
```

**Chrome extension** — built with [WXT](https://wxt.dev). After `pnpm ext:build` (or `pnpm ext:dev`), load unpacked in Chrome from:

- Production: `apps/chrome-extension/dist/chrome-mv3/`
- Dev watch: `apps/chrome-extension/dist/chrome-mv3-dev/`

See [`apps/chrome-extension/README.md`](apps/chrome-extension/README.md) for setup details.

## Environment

Example env files are checked in for the runnable surfaces:

| Path                                 | Used by                                                |
| ------------------------------------ | ------------------------------------------------------ |
| `.env.example`                       | SDK/HTTP scripts using `@vmem/sdk`                     |
| `apps/web/.env.example`              | Vite web app                                           |
| `apps/chrome-extension/.env.example` | Extension build-time Convex/Clerk config               |
| `packages/backend/.env.example`      | Backend CLI scripts and Convex deployment var template |
| `packages/sdk/.env.example`          | SDK examples and local package testing                 |

Copy the relevant file to `.env.local` before running that surface.

**Web** — `apps/web/.env.local`:

```
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

**Convex dashboard** (Settings → Environment Variables) — minimum:

```
CLERK_FRONTEND_API_URL
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY   # MCP OAuth token verification
ENCRYPTION_KEY          # base64 AES-256 for API key encryption
NEO4J_URI
NEO4J_USERNAME          # optional, defaults to neo4j
NEO4J_PASSWORD
CONVEX_SITE_URL         # https://<deployment>.convex.site
WEB_APP_URL             # http://localhost:5173 in dev
```

Optional: `OPENROUTER_API_KEY` (server embeddings/context when users have no key), `GOOGLE_CLIENT_*` / `NOTION_CLIENT_*` (connector OAuth), `GITHUB_CLIENT_*` (codebase sync OAuth).

**Chrome extension** — copy `apps/chrome-extension/.env.example` to `apps/chrome-extension/.env.local` before `pnpm ext:dev` / `pnpm ext:build`. Load the built folder under `apps/chrome-extension/dist/chrome-mv3/` (or `chrome-mv3-dev/` while watching), not a flat `dist/`.

**Neo4j CLI scripts** (`eval:bench`, live HTTP tests) — `packages/backend/.env.local` with `NEO4J_URI`, `NEO4J_PASSWORD`, and optionally `OPENROUTER_API_KEY`.
