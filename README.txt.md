# vmem — Product Package README

Final Year Project, City St George's, University of London  
**Student:** Vedant Bhopatrao  
**Student Number:** 220057806

---

## For markers (read this first)

**Hosted product (preferred for marking):**  
[https://vmem-staging.vedantb.com/](https://vmem-staging.vedantb.com/)

**Source repository:**  
[https://github.com/vvedantb/vmem](https://github.com/vvedantb/vmem)

This ZIP contains the source needed to run vmem locally. Secrets (`.env.local`) are **not** included. Use the hosted URL above unless you need a full local stack (Convex + Neo4j + Clerk).

### Quick test on the hosted site

1. Open [https://vmem-staging.vedantb.com/](https://vmem-staging.vedantb.com/)
2. Sign in with Clerk (create an account if needed)
3. Open a profile workspace
4. Add a memory (list or graph view) and confirm it appears
5. Optional: open Settings and review API keys / connectors

---

## ZIP folder structure

```
vmem/
  README.txt                 This file (also upload separately to Moodle)
  README.md                  Same content as Markdown for developers
  package.json               Root pnpm workspace scripts
  pnpm-workspace.yaml
  apps/
    web/                     Vite + React dashboard
    chrome-extension/        WXT Chrome extension (MV3)
  packages/
    backend/                 Convex backend + Neo4j engine (engine/)
    shared/                  Shared constants / helpers
    ui/                      Shared UI primitives
    sdk/                     Published HTTP SDK (@vmem/sdk)
  oxlint-plugin-vmem/        Custom lint rules
  .env.example               Env templates (also under apps/* and packages/*)
```

**Not included in the ZIP (by design):**  
`node_modules/`, `.git/`, `dist/`, `.env.local`, secrets, large build artefacts

---

## What is vmem

A model-agnostic memory layer for AI — store, retrieve, update, and explain what an agent knows about a user across sessions, models, and tools.

vmem centralises user knowledge in a Neo4j memory graph with hybrid retrieval (fulltext + vectors + chunks + entities + graph expansion). Clients (web, Chrome extension, MCP host, HTTP/SDK) talk to Convex; Neo4j holds the graph.

### Differentiators

- **Context Trace** — retrieval explains why it matched (score breakdown)
- **Proposed updates** — conflicts become reviewable proposals
- **Implicit MCP context** — `vmem://context_prompt` (personal MCP only)
- **Profiles and teams** — isolated memory workspaces
- **Dream Mode** — activity-triggered and/or scheduled synthesis

### Architecture (high level)

```
Web dashboard | Chrome extension | MCP hosts | HTTP / SDK
               \________\________/________/
                        |
                  Convex (packages/backend)
                  auth, profiles, MCP HTTP, connectors, files, crons
                        |
                  engine/ (Neo4j + parsers) via "use node" actions
                        |
                  Neo4j graph
```

### Layers

| Layer       | Role                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| **Convex**  | Auth (Clerk), API keys, profiles, teams, connectors, files, MCP/HTTP endpoints, scheduled jobs |
| **Neo4j**   | Memory nodes, tags, entities, `RELATES_TO`, chunks, codebase graph                             |
| **engine/** | Retrieval, enrichment, connector ingest, GitHub parsing                                        |

---

## How agents integrate

| Surface  | Endpoint / package                     | Auth                                | Best for                               |
| -------- | -------------------------------------- | ----------------------------------- | -------------------------------------- |
| **MCP**  | `https://<deployment>.convex.site/mcp` | Clerk OAuth bearer tokens           | Claude Desktop, Cursor, Windsurf, etc. |
| **HTTP** | `/api/v1/memories/*`                   | `Authorization: Bearer vmem_sk_...` | Backends, scripts, CI                  |
| **SDK**  | `@vmem/sdk`                            | API key                             | TypeScript/JS integrations             |

### MCP notes

- Resource: `vmem://context_prompt` (personal scope only; not on `/mcp/team`)
- Core tools: `ping`, `whoami`, `list_profiles`, `set_active_profile`, `context_prompt_get`
- Domain tools: `memory_*`, `skills_*`, `wiki_*`, `files_*`, `codebases_list`, `codebase_*`, `memory_graph`
- Team endpoint: `/mcp/team`

### Example (SDK)

```ts
import { VMemory } from "@vmem/sdk";

const vmem = new VMemory({
  apiKey: process.env.VMEM_API_KEY,
  baseUrl: process.env.VMEM_BASE_URL,
});

await vmem.save("User prefers TypeScript over JavaScript");
const { memories } = await vmem.search("What language does the user prefer?");
```

See [`packages/sdk/README.md`](packages/sdk/README.md) for full HTTP/SDK details.

---

## Monorepo layout

pnpm workspace (`pnpm@10.15.1`). Requires **Node 20+**.

| Path                    | Role                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `apps/web`              | Web app (Vite + React 19 + TanStack Router)                                          |
| `apps/chrome-extension` | Chrome extension (WXT) — save pages, chat export, inject context into ChatGPT/Claude |
| `packages/backend`      | Convex + Neo4j engine + MCP HTTP                                                     |
| `packages/shared`       | Cross-app constants / helpers                                                        |
| `packages/ui`           | Shared UI library                                                                    |
| `packages/sdk`          | Published HTTP SDK (`VMemory`)                                                       |
| `oxlint-plugin-vmem/`   | Custom oxlint rules                                                                  |

Apps import only `@vmem/backend`, `@vmem/shared`, and `@vmem/ui` at public exports.

---

## What is implemented

### Memory

- CRUD, hybrid retrieval with Context Trace, proposed-update inbox
- Types: profile, episodic, knowledge
- Lifecycle: active, pinned, suppressed, expired
- Enrichment (OpenRouter), semantic auto-linking, file upload indexing
- Graph view, tag filters, version history

### Workspaces

- Profiles as `/$profileId/...` routes
- Teams with shared graph and team MCP
- Inbox (proposals/notifications), activity log

### Data and ingest

- **Files** — Convex storage + web explorer
- **Codebases** — GitHub OAuth, symbol parse, daily sync 04:00 UTC (Workpool)
- **Connectors** — Google Drive and Notion (daily cron via Workpool)
- **Skills** — personal + system Skills Hub catalogue
- **Wiki** — TipTap markdown tree + versions
- **Import** — ChatGPT and Claude conversation exports

### Chrome extension

- Chat export, save page/screenshot/YouTube transcript
- Inject context into supported chat UIs
- Bookmark/history bulk import and auto-sync

### Platform

- Clerk auth (MCP OAuth via Clerk Dynamic Client Registration)
- Encrypted API keys (`vmem_sk_*`), per-user OpenRouter secrets
- Activity / OpenRouter logs, audit trail
- Connector OAuth via Arctic (Google PKCE, Notion, GitHub)

---

## Install and run locally

**Prerequisites:** Node 20+, pnpm 10.15.1, a Convex project, Neo4j, Clerk app.

```bash
git clone https://github.com/vvedantb/vmem.git
cd vmem
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp packages/backend/.env.example packages/backend/.env.local
pnpm convex    # Convex dev (packages/backend)
pnpm dev       # Web — http://localhost:5173
```

### Other commands

| Command              | Purpose                                             |
| -------------------- | --------------------------------------------------- |
| `pnpm ext:dev`       | Chrome extension WXT watch → `dist/chrome-mv3-dev/` |
| `pnpm ext:build`     | Production build → `dist/chrome-mv3/`               |
| `pnpm typecheck:all` | Typecheck all workspaces                            |
| `pnpm test`          | Unit tests                                          |
| `pnpm check`         | Full merge gate                                     |
| `pnpm eval:bench`    | Retrieval bench (bench user only)                   |

**Chrome extension (WXT):** after `ext:build` or `ext:dev`, load unpacked from:

- `apps/chrome-extension/dist/chrome-mv3/`
- or `apps/chrome-extension/dist/chrome-mv3-dev/`

See [`apps/chrome-extension/README.md`](apps/chrome-extension/README.md).

---

## Environment

Example env templates (copy to `.env.local` — **do not commit secrets**):

| Template                             | Purpose                           |
| ------------------------------------ | --------------------------------- |
| `.env.example`                       | SDK / HTTP scripts                |
| `apps/web/.env.example`              | Web app                           |
| `apps/chrome-extension/.env.example` | Extension                         |
| `packages/backend/.env.example`      | Backend CLI + Convex var template |
| `packages/sdk/.env.example`          | SDK examples                      |

### Web (`apps/web/.env.local`)

```bash
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_...
```

### Convex dashboard (minimum)

| Variable                 | Notes                              |
| ------------------------ | ---------------------------------- |
| `CLERK_FRONTEND_API_URL` |                                    |
| `CLERK_SECRET_KEY`       |                                    |
| `CLERK_PUBLISHABLE_KEY`  | MCP OAuth token verification       |
| `ENCRYPTION_KEY`         | base64 AES-256                     |
| `NEO4J_URI`              |                                    |
| `NEO4J_USERNAME`         | optional, defaults to `neo4j`      |
| `NEO4J_PASSWORD`         |                                    |
| `CONVEX_SITE_URL`        | `https://<deployment>.convex.site` |
| `WEB_APP_URL`            | `http://localhost:5173` in dev     |

**Optional:** `OPENROUTER_API_KEY`, `GOOGLE_CLIENT_*`, `NOTION_CLIENT_*`, `GITHUB_CLIENT_*`.
