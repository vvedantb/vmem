# Move GitHub OAuth to Convex HTTP Actions

## Context

GitHub OAuth flow currently lives in Next.js API routes (`apps/web/app/api/auth/github/`). User wants it moved to Convex so the callback URL is the Convex site URL (`*.convex.site`) instead of the Next.js domain. The current flow also has a CSRF issue — generates a `state` param but never validates it on callback. The new design fixes this inherently.

## Key Insight

GitHub's OAuth callback is a bare browser redirect (`GET ?code=xxx&state=yyy`) — no Clerk JWT attached. Convex httpActions CAN verify Clerk JWTs via `ctx.auth.getUserIdentity()`, but the callback has none. **Solution:** use the `state` param to carry userId through the flow — store state→userId mapping in Convex before redirect, look it up on callback.

---

## Step 1: Add `oauthStates` table

**File:** `packages/backend/convex/schema.ts`

```
oauthStates: defineTable({
  state: v.string(),
  userId: v.id("users"),
  returnUrl: v.string(),
  expiresAt: v.number(),
}).index("by_state", ["state"]),
```

Temporary entries, one per OAuth initiation. Consumed (deleted) on callback. `returnUrl` stores the frontend origin so the callback knows where to redirect — supports same Convex deployment serving multiple frontends (dev/staging). No cleanup cron needed — volume is negligible.

## Step 2: Add OAuth state helpers + `startGitHubOAuth` action to `github.ts`

**File:** `packages/backend/convex/github.ts`

### New internal functions:

**`insertOAuthStateInternal`** — `internalMutation`

- Args: `{ state, userId, returnUrl, expiresAt }`
- Inserts into oauthStates table

**`consumeOAuthStateInternal`** — `internalMutation`

- Args: `{ state }`
- Queries by_state index → if found, deletes entry and returns `{ userId, returnUrl, expiresAt }`. If not found, returns null.
- Mutation (not query) so read+delete is atomic — prevents replay attacks.

### New public action:

**`startGitHubOAuth`** — `authAction`

- Args: `{ returnUrl: v.string() }` — the frontend's `window.location.origin`
- Generates `crypto.randomUUID()` state
- Stores state + returnUrl in oauthStates with 5-min TTL
- Builds GitHub authorize URL with `redirect_uri` = `{CONVEX_SITE_URL}/api/auth/github/callback`
- Returns the URL string → frontend redirects browser to it

### New internal action:

**`handleGitHubCallbackInternal`** — `internalAction`

- Args: `{ code, state }`
- Consumes state → gets userId + returnUrl (or returns error)
- Checks expiry
- Exchanges code for token via `POST github.com/login/oauth/access_token` (uses `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` from Convex env)
- Fetches GitHub user profile
- Encrypts token, upserts githubConnection (reuses existing `encryptToken`, `getConnectionInternal`, `insertConnectionInternal`, `updateConnectionInternal`)
- Returns `{ error: string | null, returnUrl: string | null }`

### Cleanup:

- Delete `storeConnection` authAction — no longer needed (callback logic is now internal)

## Step 3: Create HTTP router

**File:** `packages/backend/convex/http.ts` (NEW)

```ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/api/auth/github/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 });
    }

    const result = await ctx.runAction(
      internal.github.handleGitHubCallbackInternal,
      { code, state },
    );

    const appUrl = result.returnUrl ?? "http://localhost:3000";

    if (result.error) {
      return Response.redirect(`${appUrl}/codebases?error=${result.error}`);
    }

    return Response.redirect(`${appUrl}/codebases?connected=true`);
  }),
});

export default http;
```

If code/state missing (tampered URL), return plain 400. Otherwise errors redirect with query param. `returnUrl` comes from the consumed state entry — no env var needed.

## Step 4: Update ConnectGitHubButton

**File:** `apps/web/app/(main)/codebases/_components/ConnectGitHubButton.tsx`

- Add `useAction(api.github.startGitHubOAuth)`
- Replace `window.location.href = "/api/auth/github"` with:
  ```ts
  const url = await startOAuth({ returnUrl: window.location.origin });
  window.location.href = url;
  ```
- Add loading state while action is in-flight (`connecting` useState — justified for async UI feedback)

## Step 5: Env vars

**Add to Convex** (via `npx convex env set`):

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `CONVEX_SITE_URL` — may already be auto-set by Convex runtime; needed for building redirect_uri in startGitHubOAuth

No `APP_URL` needed — frontend origin is passed per-request via `returnUrl` arg, stored in oauthStates, read back on callback.

**Update GitHub OAuth App settings:**

- Change callback URL to `https://outgoing-reindeer-268.eu-west-1.convex.site/api/auth/github/callback`

## Step 6: Cleanup

**Delete:**

- `apps/web/app/api/auth/github/route.ts`
- `apps/web/app/api/auth/github/callback/route.ts`

**Clean up env schemas:**

- `apps/web/env/server.ts` — remove `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `apps/web/env/client.ts` — remove `NEXT_PUBLIC_GITHUB_CLIENT_ID`

**Update:** `CLAUDE.md` — update Codebases section to reflect OAuth is now Convex-side

---

## Edge Cases

- **Expired state:** consumed (deleted) even if expired, then error returned → prevents replay
- **Duplicate state:** `consumeOAuthStateInternal` is an atomic mutation — second callback with same state finds nothing, gets rejected
- **Abandoned flow:** orphaned oauthStates entries are tiny, accumulate negligibly, no cron needed
- **GitHub returns error:** callback checks for missing `code`, redirects with `error=missing_params`
- **CSRF fix:** current code generates state but never validates — new design validates inherently since state is the userId lookup key

## Files Modified

| File                                                                | Action                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/backend/convex/schema.ts`                                 | Add `oauthStates` table                                                                                |
| `packages/backend/convex/github.ts`                                 | Add `startGitHubOAuth`, `handleGitHubCallbackInternal`, state CRUD internals; remove `storeConnection` |
| `packages/backend/convex/http.ts`                                   | **NEW** — httpRouter with callback                                                                     |
| `apps/web/app/(main)/codebases/_components/ConnectGitHubButton.tsx` | Use `useAction` instead of navigation                                                                  |
| `apps/web/app/api/auth/github/route.ts`                             | **DELETE**                                                                                             |
| `apps/web/app/api/auth/github/callback/route.ts`                    | **DELETE**                                                                                             |
| `apps/web/env/server.ts`                                            | Remove GitHub env vars                                                                                 |
| `apps/web/env/client.ts`                                            | Remove `NEXT_PUBLIC_GITHUB_CLIENT_ID`                                                                  |
| `CLAUDE.md`                                                         | Update Codebases section                                                                               |

## Verification

1. Set Convex env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_URL`
2. Update GitHub OAuth App callback URL to Convex site URL
3. Click "Connect GitHub" → verify redirect to GitHub → callback stores connection → redirects to /codebases?connected=true
4. Verify expired state (>5 min) is rejected
5. `cd packages/backend && npx convex codegen --typecheck enable` — no errors
