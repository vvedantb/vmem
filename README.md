┌─────────────────────────────────────────────────┐
│ AI Agent │
└─────────────────────┬───────────────────────────┘
│
┌─────────────────────▼───────────────────────────┐
│ vmem MCP │
│ ┌───────────┬───────────┬───────────┬────────┐ │
│ │ memory*\* │ codebase*_│ email\__ │browser\_\*│ │
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

vmem provides a centralised memory server accessible via REST API and MCP (Model Context Protocol), enabling any LLM to read/write user memories with semantic search, metadata tagging, and a graph-based UI for browsing and managing stored knowledge.

## Monorepo Layout

| Path               | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `apps/web`         | Next.js frontend — auth, memory management UI, API key management  |
| `packages/backend` | Convex schema + functions (auth, memories, API keys, request logs) |
| `packages/ui`      | Shared shadcn/ui component library (`@vmem/ui`)                    |

## What is implemented

- Clerk auth + Convex user bootstrap (`auth.ensureUserExists`)
- API key management — create, reveal, copy, revoke (AES-GCM encrypted at rest)
- API request logging per key
- Frontend memory CRUD (currently client-side mock; Convex `memories` table ready)
- Responsive sidebar with collapsible desktop + mobile drawer

## Run

```bash
pnpm install
pnpm convex   # deploy/sync Convex functions
pnpm dev      # starts web app + Convex dev server concurrently
```

## Environment

```
NEXT_PUBLIC_CONVEX_URL
CLERK_*                  # standard Clerk environment variables
ENCRYPTION_KEY           # base64-encoded AES-256 key for API key encryption (Convex env)
```
