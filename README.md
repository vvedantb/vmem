<!-- AI-generated (Claude), prompt: "write root readme for the vmem monorepo" -->
<!-- Modified by me: aligned tone with README.txt, dropped marketing layout -->

# vmem — Universal LLM Memory Layer

BSc Final Year Project — City St George's, University of London  
Vedant Bhopatrao (220057806)

**Hosted build:** [vmem-staging.vedantb.com](https://vmem-staging.vedantb.com/)  
**Source:** [github.com/vvedantb/vmem](https://github.com/vvedantb/vmem)

Create a Clerk account if you do not have one, open a profile, add a memory from the list or graph, and check it shows up. Settings has API keys and connectors if you want to explore further.

This repo is the source tree. It does not include `.env.local` or other secrets. You do not need a local stack to try the product — use the hosted URL unless you specifically want Convex + Neo4j + Clerk on your machine.

## What it is

vmem is a memory layer for AI tools. LLMs forget between sessions and across providers. This project keeps a shared, inspectable graph of what the user knows and cares about, and exposes it over MCP, HTTP, and a small SDK.

Memories live in Neo4j. Convex handles auth, profiles, teams, the web/API surface, and scheduled work. The web app and Chrome extension are clients on top of that. Retrieval mixes fulltext, vectors, chunks, entities, and a hop of graph expansion, then explains the match in a Context Trace rather than returning a black-box rank.

Other bits worth knowing: conflicting updates become proposals instead of silent overwrites, team workspaces share one profile graph, Dream Mode synthesises higher-level memories in the background.

## Layout

pnpm workspace, Node 20+, pnpm 10.15.1.

| Path                    | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `apps/web`              | dashboard (Vite, React, TanStack Router)         |
| `apps/chrome-extension` | MV3 extension (WXT) — save pages, inject context |
| `packages/backend`      | Convex functions + Neo4j engine under `engine/`  |
| `packages/shared`       | shared helpers                                   |
| `packages/ui`           | shared UI                                        |
| `packages/sdk`          | `@vmem/sdk`                                      |

`.env.example` files live at the root and under `apps/*` / `packages/*`.

## Talking to it from an agent

| Surface                                    | Auth               | Notes                                                                         |
| ------------------------------------------ | ------------------ | ----------------------------------------------------------------------------- |
| MCP `https://<deployment>.convex.site/mcp` | Clerk OAuth        | Team scope at `/mcp/team`. Personal MCP also exposes `vmem://context_prompt`. |
| HTTP `/api/v1/memories/*`                  | `Bearer vmem_sk_…` |                                                                               |
| SDK `@vmem/sdk`                            | API key            | See [`packages/sdk/README.md`](packages/sdk/README.md)                        |

```ts
import { VMemory } from "@vmem/sdk";

const vmem = new VMemory({
  apiKey: process.env.VMEM_API_KEY,
  baseUrl: process.env.VMEM_BASE_URL,
});

await vmem.save("User prefers TypeScript over JavaScript");
const { memories } = await vmem.search("preferred language");
```

## Running locally

You need Node 20+, pnpm, a Convex project, Neo4j, and a Clerk app. Copy the example env files and fill them in before starting anything.

```bash
git clone https://github.com/vvedantb/vmem.git && cd vmem
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp packages/backend/.env.example packages/backend/.env.local
pnpm convex
pnpm dev
```

Web app is at http://localhost:5173.

```bash
pnpm ext:dev / pnpm ext:build   # extension under apps/chrome-extension/dist/
pnpm typecheck:all
pnpm test
pnpm check
pnpm eval:bench                 # retrieval bench (bench user only)
```

More on the extension: [`apps/chrome-extension/README.md`](apps/chrome-extension/README.md).

## Environment

Templates (copy to `.env.local`):

- `.env.example`
- `apps/web/.env.example`
- `apps/chrome-extension/.env.example`
- `packages/backend/.env.example`
- `packages/sdk/.env.example`

Web needs at least:

```
VITE_CONVEX_URL
VITE_CLERK_PUBLISHABLE_KEY
```

Convex dashboard needs at least:

```
CLERK_FRONTEND_API_URL
CLERK_SECRET_KEY
CLERK_PUBLISHABLE_KEY
ENCRYPTION_KEY              # base64
NEO4J_URI
NEO4J_PASSWORD              # NEO4J_USERNAME defaults to neo4j
CONVEX_SITE_URL
WEB_APP_URL
OPENROUTER_API_KEY
```

Optional: `GOOGLE_CLIENT_*`, `NOTION_CLIENT_*`, `GITHUB_CLIENT_*`.
