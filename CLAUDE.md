# CLAUDE.md

This file provides repository guidance for coding agents.

## Project Overview

`vmem` is a universal, model-agnostic memory layer for AI systems. The repository is a Final Year Project (BSc Computer Science, City University of London).

## Monorepo Structure

- `apps/web` - Next.js 16 dashboard + API proxy routes
- `apps/api` - Fastify TypeScript memory engine (Postgres + pgvector)
- `packages/backend` - Convex package for non-vector account data
- `packages/ui` - shared UI components
- `packages/types` - shared TypeScript interfaces/contracts
- `packages/mcp` - MCP server package
- `internal` - planning, changelog, proposal, ADRs, contracts

## Data Architecture

- Convex handles user/account-style non-vector data.
- Postgres + pgvector handles memory/search/chat/API-key data.
- Frontend preserves `/api/*` paths and proxies selected routes to `apps/api` through feature flags.

## Commands

```bash
pnpm dev                 # web dev server
pnpm build               # web build
pnpm lint                # web lint
pnpm typecheck           # web typecheck
pnpm api:dev             # memory engine dev
pnpm api:migrate         # memory engine migrations
pnpm mcp:dev             # mcp server dev
```

## Frontend Stack (`apps/web`)

- Next.js 16 App Router + React 19 + TypeScript (strict)
- Clerk authentication
- Convex provider integration
- Tailwind CSS 3 + `@vmem/ui`
- Vercel AI SDK component primitives from `@vmem/ui/ai`

## Backend Stack (`apps/api`)

- Fastify + TypeScript
- PostgreSQL + pgvector
- OpenRouter-backed chat + embeddings
- SSE endpoint for chat streaming (`/v1/chat`)

## Key Rules

- Avoid `any`.
- Keep Server Components as default in web app.
- Preserve frozen `/api/*` response contracts when changing route behavior.
- Prefer adding medium/large updates to `internal/changelog.md`.
- Run `pnpm typecheck` and `pnpm lint` before finalizing substantial changes.
