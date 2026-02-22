# apps/web

Next.js frontend for vmem.

## Stack

- Next.js 15 (App Router)
- React 19 + TypeScript
- Clerk auth (`@clerk/nextjs`)
- Convex live queries + mutations (`convex/react`)
- `@vmem/ui` shared component library
- Tailwind CSS v4
- Framer Motion, sonner (toasts), `next-themes`

## Route Structure

```
app/
  (auth)/           # Clerk sign-in + sign-up pages
  (main)/           # Authenticated area — wrapped in EnsureUser + MainShell
    page.tsx        # Dashboard
    memories/       # List, tags, graph views
    api/            # API keys + request logs
    chat/
    files/
    connectors/
    notifications/
    profile/
    settings/
```

## Key Architecture Notes

- `app/layout.tsx` — root layout: `ClerkProvider` > `ClientProvider`
- `ClientProvider` — sets up Convex, next-themes, ThemeContext, NotificationContext, MemoryProvider
- `EnsureUser` — bootstraps the Convex user record on first sign-in
- `MainShell` — collapsible sidebar + scrollable content pane
- Memory data is **currently client-side mock** (`MemoryContext` + `lib/mock-memories.ts`). The Convex `memories` table is defined but not yet wired to the UI.

## Environment

```
NEXT_PUBLIC_CONVEX_URL
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/register
```

## Run

```bash
pnpm --filter web dev
```
