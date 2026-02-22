# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

vmem is a universal, model-agnostic LLM memory layer. Users can store, retrieve, and manage memories across AI sessions. It exposes a REST API and MCP server.

## Monorepo Structure

- `apps/web` — Next.js 15 frontend with Clerk auth and Convex live queries
- `packages/backend` — Convex schema, functions, and auth helpers
- `packages/ui` — Shared shadcn/ui component library (`@vmem/ui`)

## Commands

```bash
# Root (runs all packages concurrently)
pnpm dev
pnpm build
pnpm lint
pnpm typecheck

# Convex backend only
pnpm convex
```

## Data Model (Convex schema)

Tables: `users`, `memories`, `apiKeys`, `apiRequestLogs`

- `users` — Clerk-linked via `clerkId`, indexed by `by_clerk_id` and `by_email`
- `memories` — Owned by `userId`, has `title`, `content`, `tags[]`, `createdAt`/`updatedAt`
- `apiKeys` — AES-GCM encrypted (`encryptedKey`), hashed (`keyHash`), masked (`maskedKey`); status: `active | revoked`
- `apiRequestLogs` — Logs per API key usage with endpoint, method, status, durationMs

## Auth Pattern

All Convex functions use custom builders from `packages/backend/convex/auth.ts`:

- `authQuery` / `authMutation` / `authAction` — inject `ctx.userId` after verifying Clerk identity
- `EnsureUser` component (`apps/web/components/providers/EnsureUser.tsx`) — calls `auth.ensureUserExists` on first sign-in to bootstrap the Convex user record

## Frontend Architecture

- `app/layout.tsx` — Root: wraps everything in `ClerkProvider` > `ClientProvider`
- `ClientProvider` — Sets up `ConvexProviderWithClerk`, `NextThemesProvider`, `ThemeProvider`, `NotificationProvider`, `MemoryProvider`
- `app/(auth)/` — Clerk sign-in/sign-up pages
- `app/(main)/` — Authenticated area; layout wraps children in `EnsureUser` > `MainShell`
- `MainShell` — Client component: sidebar + scrollable content area
- `Sidebar` — Desktop collapsible + mobile dialog; nav groups: Workspace, Integrations, Account

**Memory data is currently mock** — `MemoryContext` seeds from `lib/mock-memories.ts` and holds state in client memory. Convex `memories` table exists but is not yet wired to the frontend.

## Key Conventions

- Import backend API refs as `import { api } from "@vmem/backend"` — never use relative paths across packages
- Derive types from Convex: `FunctionReturnType<typeof api.fn>`, `Doc<"table">`, `Id<"table">`
- Icons come from `@tabler/icons-react`
- Toast notifications via `sonner` (imported from `@vmem/ui` or `sonner` directly)
- Font: `Instrument Sans` (variable `--font-instrument-sans`), `Instrument Serif` (logo/headings)

## Environment Variables

```
NEXT_PUBLIC_CONVEX_URL
CLERK_* (standard Clerk env vars)
ENCRYPTION_KEY (base64 AES-256 key for API key encryption, used in Convex)
```
