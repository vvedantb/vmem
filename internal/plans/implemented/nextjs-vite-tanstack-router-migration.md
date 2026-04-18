# Next.js → Vite + TanStack Router Migration

## Context

Next.js dev/build speeds are too slow. Migrating to Vite + TanStack Router for faster iteration. Staying on Vercel. App is already ~100% client-side with Convex queries.

## Approach

**Create `apps/web-v2`** — new Vite app alongside existing `apps/web` (Next.js untouched). Copy components, migrate routing. Delete `apps/web` only after `web-v2` is verified working.

## Summary

- **23 pages**, 1 dynamic route (`/codebases/$id`)
- **Minimal SSR** — almost all `"use client"`
- **nuqs stays** — has TanStack Router adapter
- **1 API route** → Convex HTTP action
- **~2-3 days** estimated effort

---

## Phase 1: Scaffold `apps/web-v2`

### 1.1 Create new app directory

```bash
mkdir apps/web-v2
```

### 1.2 Dependencies (`apps/web-v2/package.json`)

**Add:**

- `vite`, `@vitejs/plugin-react`, `@tanstack/react-router`, `@tanstack/router-vite-plugin`
- `@clerk/clerk-react`
- Copy shared deps from `apps/web`: `convex`, `nuqs`, `sonner`, `next-themes`, `framer-motion`, `@vmem/ui`, etc.

### 1.3 Create `apps/web-v2/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import path from "path";

export default defineConfig({
  plugins: [react(), TanStackRouterVite()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 3001 }, // Different port from Next.js
});
```

### 1.4 Create `apps/web-v2/index.html`

- Non-blocking Google Fonts (Conductor pattern)
- Preconnect to fonts.googleapis.com + fonts.gstatic.com
- Load Instrument Sans + Instrument Serif via `media="print" onload="this.media='all'"`

### 1.5 Env vars (`apps/web-v2/.env.local`)

- Copy from `apps/web/.env.local`
- Rename `NEXT_PUBLIC_*` → `VITE_*`
- Simple validation in `src/env.ts` (no t3-env)

### 1.6 Copy shared assets

```bash
cp -r apps/web/public apps/web-v2/public
```

### 1.7 Create `apps/web-v2/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "ES2020"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] },
    "types": ["vite/client"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "../../packages/backend" }]
}
```

### 1.8 Update root `pnpm-workspace.yaml` (if needed)

Ensure `apps/web-v2` is included in workspace.

---

## Phase 2: Directory Structure

### 2.1 Copy components from `apps/web`

```bash
cp -r apps/web/components apps/web-v2/src/components
```

### 2.2 TanStack file-based routing structure

```
apps/web-v2/src/
├── main.tsx                 # Entry
├── routes/
│   ├── __root.tsx           # ClerkProvider + ClientProvider
│   ├── index.tsx            # Landing (/)
│   ├── agent-callback.tsx   # /agent-callback
│   └── _main/               # Protected layout group
│       ├── route.tsx        # EnsureUser + MainShell
│       ├── home.tsx
│       ├── chat.tsx
│       ├── memories/
│       │   ├── index.tsx
│       │   └── tags.tsx
│       ├── files.tsx
│       ├── wiki.tsx
│       ├── voice.tsx
│       ├── skills.tsx
│       ├── codebases/
│       │   ├── index.tsx
│       │   └── $id.tsx      # Dynamic route
│       ├── notifications.tsx
│       ├── usage.tsx
│       └── settings/
│           └── (7 routes)
├── components/              # Move from apps/web/components
└── env.ts
```

---

## Phase 3: Provider Stack Migration

### `src/routes/__root.tsx`

```tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { ClerkProvider } from "@clerk/clerk-react";
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
// ... rest of providers from ClientProvider.tsx

export const Route = createRootRoute({ component: RootComponent });

function RootComponent() {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <NuqsAdapter>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {/* ... full provider stack from ClientProvider */}
          <Outlet />
        </ConvexProviderWithClerk>
      </NuqsAdapter>
    </ClerkProvider>
  );
}
```

---

## Phase 4: Component Updates

### 4.1 Navigation (7 files)

| Next.js                     | TanStack Router                         |
| --------------------------- | --------------------------------------- |
| `useRouter().push('/x')`    | `navigate({ to: '/x' })`                |
| `useRouter().replace('/x')` | `navigate({ to: '/x', replace: true })` |
| `usePathname()`             | `useLocation().pathname`                |

### 4.2 Link (24+ uses)

```tsx
// Before
import Link from "next/link";
<Link href="/home">...</Link>;

// After
import { Link } from "@tanstack/react-router";
<Link to="/home">...</Link>;
```

### 4.3 Images (2 files)

Replace `next/image` with `<img>`:

- `app/page.tsx` — landing page icon
- `components/Chat.tsx` — GitHub avatars

### 4.4 Clerk imports (11 files)

```tsx
// Before
import { useAuth, UserButton } from "@clerk/nextjs";

// After
import { useAuth, UserButton } from "@clerk/clerk-react";
```

### 4.5 nuqs adapter (1 file)

```tsx
// ClientProvider.tsx (or __root.tsx)
import { NuqsAdapter } from "nuqs/adapters/tanstack-router";
```

---

## Phase 5: Agent Login → Convex HTTP Action

### 5.1 Add route to `packages/backend/convex/http.ts`

```ts
http.route({
  path: "/api/auth/agent-login",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    // Only in dev
    if (process.env.CONVEX_SITE_URL?.includes("convex.cloud")) {
      return jsonResponse({ error: "Dev only" }, 403);
    }

    const result = await ctx.runAction(
      internal.auth.createAgentSignInToken,
      {},
    );
    if (result.error) return jsonResponse({ error: result.error }, 500);

    const host = req.headers.get("x-forwarded-host") ?? "localhost:3000";
    const callbackUrl = `https://${host}/agent-callback?ticket=${result.token}`;
    return Response.redirect(callbackUrl, 302);
  }),
});
```

### 5.2 Add internal action

Create `packages/backend/convex/auth.ts`:

```ts
import { internalAction } from "./_generated/server";
import { createClerkClient } from "@clerk/backend";

export const createAgentSignInToken = internalAction({
  args: {},
  handler: async () => {
    const userId = process.env.AGENT_CLERK_USER_ID;
    if (!userId) return { error: "AGENT_CLERK_USER_ID missing", token: null };

    const clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    const { token } = await clerk.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 60,
    });
    return { error: null, token };
  },
});
```

### 5.3 Update agent-callback route

`src/routes/agent-callback.tsx` — use `useSearch()` instead of `useSearchParams()`

---

## Phase 6: Fonts (Conductor Pattern)

### 6.1 `index.html` — Google Fonts CDN

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400..700;1,400..700&family=Instrument+Serif:ital@0;1&display=swap"
  media="print"
  onload="this.media='all'"
/>
```

### 6.2 `globals.css` — CSS variables

```css
:root {
  --font-instrument-sans: "Instrument Sans", system-ui, sans-serif;
  --font-instrument-serif: "Instrument Serif", Georgia, serif;
}
```

### 6.3 Remove `next/font` imports from layout.tsx

---

## Phase 7: Vercel Deploy

### Create `apps/web-v2/vercel.json`

```json
{
  "framework": "vite",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### `apps/web-v2/package.json` scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }
}
```

### Update root `turbo.json` (if using Turborepo)

Add `web-v2` to the pipeline.

---

## Phase 8: Finalize

### 8.1 Test `web-v2` thoroughly

- All routes work
- Auth flows work
- Convex queries load
- nuqs filters work

### 8.2 Point Vercel to `apps/web-v2`

Update Vercel project settings: root directory → `apps/web-v2`

### 8.3 Delete `apps/web` (later, after verified)

Only after `web-v2` is production-stable. Keep `apps/web` as backup until then.

---

## Critical Files

| Source (copy from)                                 | Target                                   | Action                          |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| `apps/web/components/`                             | `apps/web-v2/src/components/`            | Copy, then update imports       |
| `apps/web/components/providers/ClientProvider.tsx` | `apps/web-v2/src/routes/__root.tsx`      | Merge into root route           |
| —                                                  | `packages/backend/convex/http.ts`        | Add agent-login route           |
| —                                                  | `apps/web-v2/src/routes/__root.tsx`      | Create (providers + layout)     |
| —                                                  | `apps/web-v2/src/routes/_main/route.tsx` | Create (EnsureUser + MainShell) |

### Files needing import updates after copy:

- `src/components/Sidebar.tsx` — navigation hooks
- `src/components/sidebar/NavLink.tsx` — Link import
- `src/components/Chat.tsx` — Image → img
- All files with `@clerk/nextjs` → `@clerk/clerk-react`

---

## Verification

1. `cd apps/web-v2 && pnpm dev` — Vite starts on :3001
2. All 23 routes render correctly
3. Clerk auth works (sign in/out)
4. Convex queries load data (memories, files, codebases)
5. nuqs filters work on /memories, /files, /wiki
6. Agent login flow works in dev (navigate to `/?agent`)
7. `pnpm build` succeeds with no type errors
8. Vercel preview deploy works (point to `apps/web-v2`)
