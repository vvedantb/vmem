# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

vmem is a universal, model-agnostic memory layer for AI systems — a Final Year Project (BSc Computer Science, City University of London). It enables any AI system to store, retrieve, and update user knowledge across sessions via REST API and MCP (Model Context Protocol).

## Monorepo Structure

- **pnpm workspaces** with `apps/*` and `packages/*`
- `apps/web/` — Next.js 16 dashboard (primary, actively developed)
- `apps/chrome-extension/` — browser extension (planned)
- `apps/mobile/` — mobile app (planned)
- `packages/backend/` — Convex backend (schema, auth, validators)
- `packages/ui/` — shared UI component library (shadcn/Radix pattern, Nova neutral theme)
- `internal/` — changelog, project plan, proposal, competitors analysis

## Commands

All root scripts proxy to the web app via `pnpm --filter web`:

```bash
pnpm dev          # Next.js dev server with Turbopack
pnpm build        # Production build
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
```

Type-check the web app directly:

```bash
cd apps/web && npx tsc --noEmit
```

Pre-commit hook (husky) runs `lint-staged` → Prettier on staged files.

## Tech Stack (Frontend — apps/web)

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** (strict)
- **@vmem/ui** — shared component library (shadcn pattern: Radix UI primitives + CVA + cn utility)
- **@vmem/ui/ai** — AI chat elements (Conversation, Message, PromptInput, Reasoning, Shimmer, CodeBlock)
- **Tailwind CSS 3** — styling with `darkMode: "class"`, OKLCH CSS variables (Nova neutral theme)
- **Tabler Icons** (`@tabler/icons-react`) — all iconography
- **next-themes** — dark/light mode switching
- **sonner** — toast notifications (imperative `toast()` API)
- **Vercel AI SDK** (`ai`) — chat types (UIMessage, ChatStatus)
- **streamdown** + plugins — streaming markdown rendering with code, math, mermaid, CJK support
- **use-stick-to-bottom** — auto-scroll for chat conversations
- **motion** — animations (shimmer effects in Reasoning component)
- **Convex** — reactive database with `@vmem/backend` package
- **Clerk** — authentication (`@clerk/nextjs` + `ConvexProviderWithClerk`)
- **React Compiler** enabled via babel plugin

## Tech Stack (Backend — planned)

- Node.js + TypeScript + PostgreSQL + pgvector
- OpenAI text-embedding-3-small for embeddings
- Clerk for authentication
- MCP server via @modelcontextprotocol/sdk
- See `internal/plan.md` for the full 5-phase build order

## Frontend Architecture

**Route groups** in `app/`:

- `(auth)/` — login, register (no sidebar)
- `(main)/` — all protected routes with sidebar layout (dashboard, memories, chat, api, connectors, files, notifications, profile, settings)

**Component patterns:**

- Server Components by default for pages/layouts
- Client Components (`"use client"`) only for pieces needing hooks, event handlers, browser APIs, or context consumers
- Context providers: ThemeContext, NotificationContext — wrapped via `components/providers/ClientProvider.tsx`
- Auth: Clerk (`ClerkProvider` in root layout) + `EnsureUser` component creates Convex user on first sign-in

**Path alias:** `@/*` maps to the web app root (e.g., `@/components/Sidebar`)

**Layout:** Root layout → ClientProvider → route group layout (sidebar + main content area with floating panel design)

## Styling Conventions

- Tailwind-first; design tokens via OKLCH CSS variables in `globals.css`, theme extension in `lib/tailwind-theme.ts`
- Nova neutral color palette (OKLCH), semantic tokens: primary, secondary, muted, accent, destructive, success, warning
- Custom animations: `aurora`, `fade-in-up`
- Fonts: Instrument Sans (400-700), Instrument Serif (400)
- Mobile-first responsive using `xs`, `sm`, `md`, `lg`, `xl`, `2xl` breakpoints

## Key Rules

- Never use the `any` type — use proper TypeScript types
- Never use `as` keyword for type assertions
- Use `FunctionReturnType` for Convex prop types (if/when Convex is added)
- Server Components by default; Client Components only for the smallest interactive pieces
- Use nuqs (`useQueryState`) for search bars, filters, and sort — install if not present
- Update `internal/changelog.md` for medium-to-large changes (not bug fixes)
- Run `npx tsc --noEmit` in `apps/web` to type-check before finishing work
