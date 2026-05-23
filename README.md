┌─────────────────────────────────────────────────┐
│ AI Agent │
└─────────────────────┬───────────────────────────┘
│
┌─────────────────────▼───────────────────────────┐
│ vmem MCP │
│ ┌───────────┬───────────┬───────────┬────────┐ │
│ │ memory*\* │ codebase*\_│ email\_\_ │browser\_\*│ │
│ │ (native) │ (proxy) │ (proxy) │(proxy) │ │
│ └─────┬─────┴─────┬─────┴─────┬─────┴────┬───┘ │
└────────┼───────────┼───────────┼──────────┼─────┘
│ │ │ │
┌────▼────┐ ┌────▼────┐ ┌────▼────┐ ┌───▼────┐
│ Convex │ │ CRG │ │ Nylas │ │Playwright│
│ Neo4j │ │ MCP │ │ MCP │ │ MCP │
└─────────┘ └─────────┘ └─────────┘ └─────────┘

# vmem — LLM Memory Layer

A universal, model-agnostic memory layer that lets any AI store, retrieve, and update user knowledge across sessions and platforms. Built as a Final Year Project at City, University of London.

## Problem

LLMs lack persistent long-term memory. Users repeat themselves across sessions, lose personalisation when switching models, and have no control over what AI remembers. Existing solutions (Mem0, GPT memory) are proprietary and locked to single ecosystems.

## Solution

vmem provides a centralised memory layer accessible via the Convex SDK and MCP (Model Context Protocol). Memories live in Neo4j with semantic search, context trace scoring, proposed updates, and a graph-based UI for browsing and managing stored knowledge.

## Monorepo Layout

| Path                    | Purpose                                           |
| ----------------------- | ------------------------------------------------- |
| `apps/web`              | Vite + React + TanStack Router dashboard          |
| `apps/mobile`           | Expo React Native app with offline local LLM chat |
| `apps/chrome-extension` | Browser extension for ChatGPT/Claude/page saves   |
| `apps/docs`             | Mintlify documentation site                       |
| `packages/backend`      | Convex functions, Neo4j actions, MCP HTTP server  |
| `packages/ui`           | Shared shadcn/ui component library (`@vmem/ui`)   |

## What is implemented

- Clerk auth + Convex user bootstrap
- Neo4j memory graph — CRUD, search, hybrid retrieval with context trace
- MCP server at `*.convex.site/mcp` with OAuth and implicit context via `vmem://context_prompt`
- Profiles, teams, skills, wiki, files, codebases, connectors
- Local LLM chat and voice with memory retrieval (`/chat`, `/voice`)
- Chrome extension — export chats, inject memories, save pages, import bookmarks/history
- API key management (AES-GCM encrypted at rest)
- Proposed updates inbox with Dream Mode synthesis
- Import from ChatGPT/Claude/Grok/DeepSeek exports

## Run

```bash
pnpm install
pnpm convex   # Convex dev server (packages/backend)
pnpm dev      # Web app (Vite)
```

Other commands:

```bash
pnpm docs:dev      # Docs preview on http://localhost:3001
pnpm ext:dev       # Chrome extension watch build
pnpm ext:build     # Chrome extension production build
pnpm mobile        # Expo dev server
```

## Environment

**Web** (`apps/web/.env.local`):

```
VITE_CONVEX_URL
VITE_CLERK_PUBLISHABLE_KEY
```

**Convex dashboard** (Settings → Environment Variables):

```
CLERK_FRONTEND_API_URL
CLERK_SECRET_KEY
ENCRYPTION_KEY
MCP_JWT_SECRET
NEO4J_URI
NEO4J_PASSWORD
CONVEX_SITE_URL
WEB_APP_URL
```

See [apps/docs/environment.mdx](apps/docs/environment.mdx) or run `pnpm docs:dev` for the full list.

## Documentation

User-facing docs live in `apps/docs/`. Preview locally with `pnpm docs:dev`.

Public docs URL is configured in the Mintlify dashboard (not stored in this repo). The web app homepage is [vmem.vedantb.com](https://vmem.vedantb.com).
