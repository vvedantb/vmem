<!-- AI-generated (Claude), prompt: "write root readme for the vmem monorepo" -->
<!-- Modified by me: clarified problem statement and architecture overview -->

# vmem

**A model-agnostic memory layer for AI** — store, retrieve, update, and explain what an agent knows about a user across sessions, models, and tools.

Built as a Final Year Project at City, University of London. Live at [vmem.vedantb.com](https://vmem.vedantb.com).

## The problem

LLMs forget between sessions. Users repeat themselves, lose personalization when switching models, and have little control over what gets remembered. Most memory products are proprietary and tied to one ecosystem.

## What vmem does

vmem centralizes user knowledge in a **Neo4j memory graph** with hybrid retrieval (fulltext + vectors + chunks + entities + graph expansion). Any client — web dashboard, Chrome extension, MCP host, or HTTP client — can read and write through **Convex**.

**Differentiators:**

- **Context Trace** — every retrieval explains _why_ it matched (score breakdown, not a black box)
- **Proposed updates** — conflicts become reviewable proposals instead of silent overwrites
- **Implicit MCP context** — `vmem://context_prompt` injects a synthesized profile before the model responds
- **Profiles & teams** — personal and team-scoped workspaces with isolated memory graphs
- **Dream Mode** — scheduled background synthesis that builds a user portrait and raises contradictions as proposals

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

- **Resource:** `vmem://context_prompt` — implicit user profile injected before the model responds
- **Tools:** `memory_*`, `skills_*`, `wiki_*`, `files_*`, `codebase_*`, `context_prompt_get`, `memory_graph` (interactive MCP App)
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

See [MCP docs](https://vmem.vedantb.com/mcp/overview) and `packages/sdk/README.md` for full API details.

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

Apps import only `@vmem/backend` (Convex `api` + types) and `@vmem/shared`.

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

- **Files** — Convex storage + web explorer; indexable uploads become memories
- **Codebases** — GitHub OAuth, symbol parsing, dependency graph, daily sync at 04:00 UTC
- **Connectors** — Google Drive and Notion (batch ingest → memories; daily cron at 04:00 UTC)
- **Skills** — personal skills + system Skills Hub catalog
- **Wiki** — folder tree with TipTap markdown docs and version history
- **Import** — ChatGPT and Claude conversation exports

### Chrome extension

- Export ChatGPT/Claude conversations, save pages/screenshots/YouTube transcripts
- Inject vmem context into supported chat UIs
- Bookmark/history bulk import, configurable auto-sync

### Platform

- Clerk auth, AES-GCM encrypted API keys (`vmem_sk_*`), per-user OpenRouter secrets
- Activity log, OpenRouter request logs, audit trail
- Settings playground for MCP tool testing

## Run locally

```bash
git clone https://github.com/vvedantb/vmem.git
cd vmem
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp packages/backend/.env.example packages/backend/.env.local
pnpm convex   # Convex dev server (packages/backend)
pnpm dev      # Web app — http://localhost:5173
```

**Other commands:**

```bash
pnpm ext:dev         # Chrome extension WXT watch / HMR → dist/chrome-mv3-dev/
pnpm ext:build       # Chrome extension production build → dist/chrome-mv3/
pnpm typecheck:all   # web + backend + extension + packages
pnpm test            # backend + web unit tests
pnpm check           # full merge gate: lint + typecheck:all + knip + tests + format
pnpm eval:bench      # bench user only — seeds, reports, cleans up (safe on shared Neo4j)
```

**Chrome extension** — built with [WXT](https://wxt.dev). After `pnpm ext:build` (or `pnpm ext:dev`), load unpacked in Chrome from:

- Production: `apps/chrome-extension/dist/chrome-mv3/`
- Dev watch: `apps/chrome-extension/dist/chrome-mv3-dev/`

See [`apps/chrome-extension/README.md`](apps/chrome-extension/README.md) for setup details.

Visit `/?agent` during web dev to auto sign in as the agent user (requires `CLERK_SECRET_KEY` + `AGENT_CLERK_USER_ID` in `apps/web/.env.local`).

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
CLERK_SECRET_KEY=sk_...          # optional, for /?agent dev login
AGENT_CLERK_USER_ID=user_...     # optional, for /?agent dev login
```

**Convex dashboard** (Settings → Environment Variables) — minimum:

```
CLERK_FRONTEND_API_URL
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY   # MCP OAuth token verification
ENCRYPTION_KEY          # base64 AES-256 for API key encryption
NEO4J_URI
NEO4J_USERNAME            # optional, defaults to neo4j
NEO4J_PASSWORD
CONVEX_SITE_URL         # https://<deployment>.convex.site
WEB_APP_URL             # http://localhost:5173 in dev
```

Optional: `OPENROUTER_API_KEY` (server embeddings/context when users have no key), `GOOGLE_CLIENT_*` / `NOTION_CLIENT_*` (connector OAuth), `GITHUB_CLIENT_*` (codebase sync OAuth), `NEO4J_USERNAME` (defaults to `neo4j`).

**Chrome extension** — copy `apps/chrome-extension/.env.example` to `apps/chrome-extension/.env.local` before `pnpm ext:dev` / `pnpm ext:build`. Load the built folder under `apps/chrome-extension/dist/chrome-mv3/` (or `chrome-mv3-dev/` while watching), not a flat `dist/`.

**Neo4j CLI scripts** (`eval:bench`, live HTTP tests) — `packages/backend/.env.local` with `NEO4J_URI`, `NEO4J_PASSWORD`, and optionally `OPENROUTER_API_KEY`.

Public docs (hosted separately): [vmem.vedantb.com](https://vmem.vedantb.com)
