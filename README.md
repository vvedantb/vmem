# vmem

> Memory layer for AI agents — store, graph, and recall context across models and sessions

BSc Final Year Project — City St George's, University of London  
Vedant Bhopatrao (220057806)

**Hosted:** [vmem.projectv.uk](https://vmem.projectv.uk/) (production; Project V Clerk) · [vmem-staging.vedantb.com](https://vmem-staging.vedantb.com/) (staging)  
**Source:** [github.com/vvedantb/vmem](https://github.com/vvedantb/vmem)

LLMs forget between sessions and across providers. vmem keeps a shared, inspectable graph of what a user knows and cares about, and exposes it over MCP, HTTP, and a small SDK.

Memories live in Convex. Convex also handles auth, profiles, teams, files/skills, connectors, scheduled work, and the public HTTP/MCP surface. The web dashboard and Chrome extension are clients on that backend. Retrieval ranks with Convex full-text search, lexical/synonym overlap, recency, temporal windows, entity/graph neighbours, and optional vector similarity when `AI_GATEWAY_API_KEY` is set. With that key, Jev reranks the top 20 hits (score / best; no hard-drop). Missing key leaves hybrid ranking as-is. Pass `judge: "off"` on HTTP/SDK retrieve to skip Jev for ablation. List and retrieve honor `type`, `tags`, and `status` (tags are lowercase-hyphenated). Agentic instruction store/update requires the gateway key and returns HTTP 422 `openrouter_required` without it. `summarize: true` joins ranked titles and does not call an LLM. Each hit still explains itself in a Context Trace.

Conflicting updates become inbox proposals instead of silent overwrites. Team workspaces share one profile graph. Dream Mode clusters near-duplicates in the background and proposes merges.

This repo is the source tree. It does not include `.env.local` or other secrets. You do not need a local stack to try the product — use the hosted URL unless you specifically want Convex + Clerk on your machine.

## Quick start

1. Open [vmem.projectv.uk](https://vmem.projectv.uk/) and sign in with Clerk (create an account if you do not have one)
2. Open a profile, add a memory from the list or graph, and check it shows up
3. Optional: connect an MCP client to `https://<deployment>.convex.site/mcp` (Clerk OAuth) or create an API key under **Settings → API → Keys**
4. Settings also has connectors and Chrome extension options if you want to explore further

## Features

### Capture

- **Memories** — `profile`, `episodic`, and `knowledge` rows with `active` / `pinned` / `suppressed` / `expired` status. Create from the dashboard, HTTP, MCP, SDK, import, files, or connectors.
- **Files** — folders, upload/preview, and PDF/text indexing into memories.
- **Import** — client-side ChatGPT, Claude, Grok, and DeepSeek export ZIP/JSON (Sources → Import). Gemini and Perplexity are coming later.
- **Chrome extension** — save page (popup, context menu, **Alt+S**), region screenshot (**Alt+Shift+S**), ChatGPT/Claude export + inject, bookmark/history import and auto-sync.
- **Connectors** — Google Drive, Gmail, Notion, Figma, GitHub OAuth sync into memories (daily cron plus on-demand). Callback is `https://<CONVEX_SITE_URL>/api/auth/connector/callback`.

### Recall

- **Hybrid retrieve** — FTS, lexical/synonym overlap, recency, temporal windows, entity/chunk/graph RRF, optional vectors (`memoryEmbeddings`).
- **Jev rerank** — when `AI_GATEWAY_API_KEY` is set, `typesafe-ai/jev` reranks the top 20 (fail-open to hybrid if the key is missing). HTTP/SDK `judge: "off"` is ablation-only; live MCP retrieve does not expose that flag.
- **Context Trace** — each hit includes a score breakdown (fulltext, vector, chunk, entity, recency, graph).
- **Views** — list, graph (`@cosmos.gl/graph`), timeline, and tags. Graph client perf bench (synthetic, no Convex): `/memories?bench=5000`.
- **Home** — stats, Dream inferred portrait, memory growth.

### Connect

- **MCP** — Streamable HTTP at `/mcp` (personal) and `/mcp/team` (team). Clerk OAuth access tokens only (not `vmem_sk_…` API keys, not Convex session JWTs). See [MCP](#mcp).
- **HTTP** — `POST`/`PATCH`/`DELETE /api/v1/memories` and `POST /api/v1/memories/retrieve` with `Bearer vmem_sk_…`.
- **SDK** — [`@vmem/sdk`](packages/sdk/README.md) (`VMemory` save / update / search).

### Operate

- **Profiles & teams** — personal profiles plus team workspaces (members, owner settings) sharing one memory graph.
- **Skills** — user/team playbooks and a system skill hub. Personal `/mcp` and team `/mcp/team` grants do not leak across connectors.
- **Proposals** — inbox for conflict/synthesis/merge proposals; approve/reject/keep-winner.
- **Dream Mode** — scheduled clustering; proposals for near-duplicates; optional Jev merge metadata when the gateway key is set.
- **API keys** — create/list/revoke in Settings. Encrypted at rest with `ENCRYPTION_KEY`.
- **Usage** — AI/gateway call logs. Inbox notifications. Data-controls danger zone (delete all). Export route is still a placeholder.
- **Experimental** — `disablePageMotion` (off by default).

## Architecture

```
Web (Clerk)  Chrome extension (Clerk)  SDK / HTTP (vmem_sk_)  MCP clients
        │
        ▼
      vmem  ────────────────────────────────────────┐
        │                                           │
        ▼                                           ▼
Convex tables + functions                 MCP HTTP on .convex.site
(memories, embeddings,                    /mcp  and  /mcp/team
files, skills, teams, proposals)          Clerk oauth_token or session_token
        │
        ├── connectors → Drive / Gmail / Notion / Figma / GitHub
        └── AI Gateway (chat, embeddings, extract, Jev)
                │
                ▼
Hybrid retrieve → Context Trace → dashboard / agent
```

Public routes are registered in `packages/backend/convex/http.ts` on the deployment `.convex.site` origin (not `.convex.cloud`).

## Tech stack

- **Frontend**: Vite, TanStack Router, React 19, Tailwind CSS v4, `@vvedantb/ui` (incl. `/shell`, `/app`, `/tokens`)
- **Backend**: Convex (functions, HTTP, `@convex-dev/crons`, workpool, action-cache, aggregate, `convex-audit-log`)
- **Auth**: Clerk — production uses the Project V instance (`clerk.projectv.uk`); preview/dev uses the Project V Clerk development instance
- **LLM**: Vercel AI Gateway (`alibaba/qwen3.7-flash`, `openai/text-embedding-3-small`, `typesafe-ai/jev`)
- **Graph UI**: `@cosmos.gl/graph` (dashboard + MCP App)
- **Extension**: WXT (MV3)
- **Docs**: Mintlify (`apps/docs`)
- **SDK**: `@vmem/sdk` (Zod, no Convex runtime)

## Self-hosting

A hosted build is already running. Self-host if you want your own Convex + Clerk project.

### Prerequisites

- Node.js 20+
- pnpm 10.15.1 (`packageManager` in root `package.json`)
- Convex account
- Clerk application (or Project V Clerk if you are deploying into that instance)

### Setup

**1. Clone and install**

```bash
git clone https://github.com/vvedantb/vmem.git && cd vmem && pnpm install
```

**2. Set up Convex**

```bash
pnpm convex
```

Follow prompts to create or link a project. Note `.convex.cloud` (app) and `.convex.site` (HTTP) URLs.

**3. Set up Clerk**

1. Create an app at [clerk.com](https://clerk.com), or use Project V Clerk (`clerk.projectv.uk` in production)
2. Note **Publishable Key** (`pk_`)
3. Note **Frontend API URL** (JWKS / MCP authorization server)
4. Note **Secret Key** (`sk_`) for Convex MCP token verify

**4. Generate `ENCRYPTION_KEY`**

Base64-encoded 32-byte AES key (API keys and connector OAuth tokens):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**5. Web app environment** (`apps/web/.env.local`)

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Optional. Local Vite /?agent Clerk ticket sign-in (apps/web/vite.config.ts).
# Dev-only — not used in production builds.
# CLERK_SECRET_KEY=sk_test_...
# AGENT_CLERK_USER_ID=user_...
```

**6. Convex environment** (run from `packages/backend`, or set in the Convex dashboard)

```bash
npx convex env set VAR value
```

There is no in-app Secrets page.

**Required:**

- `CLERK_FRONTEND_API_URL` — Clerk JWKS + MCP authorization server
- `CLERK_SECRET_KEY` — Clerk Backend API / MCP `authenticateRequest`
- `CLERK_PUBLISHABLE_KEY` — MCP OAuth token verify
- `ENCRYPTION_KEY` — base64 AES-256 key from step 4
- `CONVEX_SITE_URL` — public `.convex.site` origin (OAuth callbacks, MCP)
- `WEB_APP_URL` — public web origin (MCP resource documentation)

**Optional:**

- `AI_GATEWAY_API_KEY` — chat, embeddings, instruction extract, Jev retrieve rerank, Dream merge metadata, skill recommend. Missing key fail-opens hybrid retrieve; instruction `save`/`update` return `422 openrouter_required`
- `OPENROUTER_LOG_PROMPTS` — set `1` to store prompt/completion previews in usage logs
- `OPENROUTER_LOG_RETENTION_DAYS` — whole days to keep usage log rows; unset keeps them forever. Usage totals keep the full history ([`apps/docs/environment.mdx`](apps/docs/environment.mdx))
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Drive and Gmail (`drive.readonly`, `gmail.readonly`)
- `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`
- `FIGMA_CLIENT_ID`, `FIGMA_CLIENT_SECRET`, `FIGMA_TEAM_IDS` — comma-separated team IDs (Figma cannot list teams)
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` — issues/PRs connector (not codebase indexing)

Connector callback for every provider: `${CONVEX_SITE_URL}/api/auth/connector/callback`. Setup notes: [`apps/docs/features/connectors.mdx`](apps/docs/features/connectors.mdx).

Copy `packages/backend/.env.example` to `packages/backend/.env.local` for local CLI tests (HTTP/MCP live harnesses). Those files must never contain real secrets in git.

**7. Chrome extension** (optional) — `apps/chrome-extension/.env.local`

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CLERK_SYNC_HOST=http://localhost:5173
```

**8. Run**

```bash
pnpm convex   # Backend
pnpm dev      # Frontend
```

Open `http://localhost:5173`.

Deploy Convex with `pnpm convex:deploy` (builds the MCP memory-graph UI first).

SDK / HTTP scripts: root `.env.example` / `packages/sdk/.env.example` (`VMEM_API_KEY`, `VMEM_BASE_URL`).

## MCP

vmem is an MCP server on the Convex HTTP origin. Auth is **Clerk OAuth** (Project V Clerk in production: `CLERK_FRONTEND_API_URL=https://clerk.projectv.uk`). Clients discover `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource` (team PRM under `/mcp/team`). There is no `MCP_JWT_SECRET`. API keys and Convex session JWTs are rejected.

**URLs**

```
https://<deployment>.convex.site/mcp
https://<deployment>.convex.site/mcp/team
```

Claude Desktop / Claude.ai: Settings → Connectors → add the `/mcp` URL → sign in (OAuth + PKCE). Cursor: Settings → MCP → remote server → same URL.

**Resources**

- `vmem://context_prompt` — synthesized user profile markdown (personal connector)
- `vmem://skills/<name>` — enabled skill playbook (grant-scoped)
- `ui://vmem/memory-graph` — MCP App HTML for the interactive graph

**Tools** (personal `/mcp` unless noted; team `/mcp/team` shares memory/skill/graph/files tools but not context_prompt)

- **Core** — `ping`, `whoami`, `list_profiles`, `set_active_profile`, `context_prompt_get` (personal), `context_pack`
- **Memory** — `memory_search`, `memory_retrieve`, `memory_add`, `memory_add_instruction`, `memory_update`, `memory_delete`, `memory_related`, `memory_timeline`, `memory_graph`
- **Skills** — `skills_list`, `skills_recommend`, `skills_get`, `skills_create`, `skills_update`, `skills_delete`
- **Files** (personal and team drive) — `files_list`, `files_storage`, `files_get`, `files_upload`, `files_delete`, `files_create_folder`, `files_rename`, `files_move`

`memory_add_instruction` needs `AI_GATEWAY_API_KEY`. `memory_graph` needs an MCP Apps–capable host. Rebuild the bundled graph UI with `pnpm --filter @vmem/backend build:mcp-graph-ui` before deploy (already part of `pnpm convex:deploy`).

Verify with `ping` then `whoami`. Tool catalog: [`apps/docs/mcp/tools.mdx`](apps/docs/mcp/tools.mdx).

## SDK

```ts
import { VMemory } from "@vmem/sdk";

const vmem = new VMemory({
  apiKey: process.env.VMEM_API_KEY,
  baseUrl: process.env.VMEM_BASE_URL,
});

await vmem.save("User prefers TypeScript over JavaScript");
const { memories } = await vmem.search("preferred language");
```

`save()` / `update()` are instruction-mode and require `AI_GATEWAY_API_KEY` on the Convex deployment (`422 openrouter_required` otherwise). Full API: [`packages/sdk/README.md`](packages/sdk/README.md).

## Chrome extension

WXT MV3 under `apps/chrome-extension`. From repo root: `pnpm ext:dev` (watch → `dist/chrome-mv3-dev/`) or `pnpm ext:build` (`dist/chrome-mv3/`). Load **that** folder unpacked in `chrome://extensions` — not the package root.

Configure from the web app at `/settings/extension` (auto-sync, selection popup). Details: [`apps/chrome-extension/README.md`](apps/chrome-extension/README.md).

## Retrieval evals

Graph client perf bench (synthetic, no Convex): `/memories?bench=5000`.

| Command                                                           | What                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @vmem/backend test:memory-bench`                   | Retrieval quality bench                                                                                            |
| `pnpm --filter @vmem/backend eval:bench`                          | Labelled IR eval                                                                                                   |
| `EVAL_JEV=1 pnpm --filter @vmem/backend eval:jev`                 | Default-on Jev vs hybrid-only (`judge: "off"`); needs `AI_GATEWAY_API_KEY`; does not mock                          |
| `EVAL_COMPETITIVE=1 pnpm --filter @vmem/backend eval:competitive` | Labelled IR vs Mem0 / SuperMemory ([notes](packages/backend/tests/memory/competitive/vmem-vs-mem0-supermemory.md)) |
| `pnpm --filter @vmem/backend eval:locomo-ir`                      | LoCoMo-IR, no LLM answer judge ([port notes](packages/backend/tests/memory/competitive/memorybench-ir-port.md))    |
| `EVAL_E2E_AB=1 pnpm --filter @vmem/backend eval:e2e-ab`           | Local-only memory on/off A/B with headless `claude -p` ([notes](docs/e2e-ab-eval.md)); add `--dry-run` for no LLM  |

Jev retrieve-gate: [`packages/backend/tests/memory/jev-retrieve-gate.md`](packages/backend/tests/memory/jev-retrieve-gate.md). Competitive brief: [`packages/backend/tests/memory/competitive-brief.md`](packages/backend/tests/memory/competitive-brief.md).

## Repository layout

pnpm workspace, Node 20+, pnpm 10.15.1.

| Package                 | Name                     | Description                                                  |
| ----------------------- | ------------------------ | ------------------------------------------------------------ |
| `apps/web`              | `web`                    | Dashboard: memories, files, skills, sources, inbox, settings |
| `apps/chrome-extension` | `@vmem/chrome-extension` | MV3 extension (WXT) — save pages, inject ChatGPT/Claude      |
| `apps/docs`             | `docs`                   | Mintlify docs (`pnpm docs:dev` → http://localhost:3001)      |
| `packages/backend`      | `@vmem/backend`          | Convex functions, memory engine, MCP HTTP                    |
| `packages/shared`       | `@vmem/shared`           | Shared constants and client-safe helpers                     |
| `packages/sdk`          | `@vmem/sdk`              | Published HTTP SDK                                           |
| `e2e/`                  | —                        | Playwright web suite (see [`e2e/README.md`](e2e/README.md))  |
| `oxlint-plugin-vmem/`   | —                        | Custom oxlint rules                                          |

`.env.example` files live at the root and under `apps/*` / `packages/*`. Shared UI is the published `@vvedantb/ui` package, not an in-repo `packages/ui`.

Removed from `main` (snapshots on archive branches only): native Expo app (`archive/mobile`), GitHub codebase indexing / Neo4j (`features/codebases.mdx`). Docs for those are kept as explicit **removed** notes.

## Development

- **Typecheck**: `pnpm typecheck:all` (web, backend, sdk, shared, extension, e2e)
- **Typecheck Convex** (no dev server): `cd packages/backend && npx convex codegen --typecheck enable`
- **Lint**: `pnpm lint` (oxlint type-aware + eslint)
- **Dead code**: `pnpm knip`
- **Tests**: `pnpm test` (backend + web + extension)
- **E2E**: `pnpm test:e2e` — Playwright against production by default (`E2E_BASE_URL=https://vmem.projectv.uk`). Needs `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` for signed-in specs. See [`e2e/README.md`](e2e/README.md)
- **Format**: `pnpm format` / `pnpm format:check`
- **Full gate**: `pnpm check`
- **Docs**: `pnpm docs:dev`
- **Deploy Convex**: `pnpm convex:deploy`

Dev agent login: visit `/?agent` during web dev (`CLERK_SECRET_KEY` + `AGENT_CLERK_USER_ID` in `apps/web/.env.local`). The landing footer **Continue without an account** is the same ticket path and is dev-only.

## Coming later

- Gemini and Perplexity conversation import ([`apps/docs/features/import.mdx`](apps/docs/features/import.mdx))
- Memory export UI (`/settings/data-controls/export` is a placeholder)

## Credits

BSc Final Year Project — City St George's, University of London. Vedant Bhopatrao (220057806).

README structure and tone follow [Eva](https://github.com/vvedantb/eva).
