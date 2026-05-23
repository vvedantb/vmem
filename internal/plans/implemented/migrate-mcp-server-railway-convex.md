# Migrate MCP Server: Railway → Convex

## Context

`apps/mcp/` is an Express app on Railway. Express owns OAuth + the MCP `/mcp` endpoint and HTTP-fetches every tool call back to `/api/mcp/*` routes in `packages/backend/convex/http.ts`. Two deployments, two cold-start paths, Railway bill.

Target: mirror `C:\Vedant\Personal\GitHub\conductor\packages\backend\convex\mcp\`. MCP server lives inside Convex `httpAction`s + a `"use node"` action. Tools/resources call `internal.*` actions directly via `ctx.runAction`. One deployment, one source of truth.

## Decisions (confirmed)

- Remove ALL `/api/mcp/*` REST routes — including `/api/mcp/context-prompt` (11 routes total in `http.ts`, not 10).
- `contextPromptApi.ts` migrated this PR: `token → clerkId` + registered as MCP **Resource** `vmem://context_prompt` (preserves current client behavior — vmem already exposes this resource via `apps/mcp/src/resources.ts`).
- Authorize page = redirect to apps/web (conductor pattern). New TanStack route at `apps/web/src/routes/mcp/oauth/authorize.tsx` calls a public `authorize` mutation. NO inline Clerk.js HTML.
- MCP served at `https://<slug>.convex.site/mcp`.
- `apps/mcp/` stays in repo with deprecation banner; deleted in follow-up PR after prod soak.
- `jsonwebtoken` (catalog dep) — vmem keeps it. (Conductor uses `jose`; we don't need the divergence.)
- `mcpClientRegistrations` includes `clientSecret: v.optional(v.string())` (match conductor).
- `MCP_JWT_SECRET` reused verbatim → existing Claude connections survive without re-auth.
- JWT TTLs unchanged: 30d access / 90d refresh (vmem current). Conductor uses 1h/30d but matching parity wins for non-disruptive cutover.
- Transport switches `StreamableHTTPServerTransport` → `WebStandardStreamableHTTPServerTransport` (required for Convex `"use node"` Web Standard Request/Response — no Node http req/res shim).

## Schema additions — `packages/backend/convex/schema.ts`

```ts
mcpAuthCodes: defineTable({
  code: v.string(),
  clerkUserId: v.string(),
  codeChallenge: v.string(),
  codeChallengeMethod: v.string(),
  redirectUri: v.string(),
  clientId: v.string(),
  expiresAt: v.number(),
}).index("by_code", ["code"]),

mcpClientRegistrations: defineTable({
  clientId: v.string(),
  clientSecret: v.optional(v.string()),
  redirectUris: v.array(v.string()),
  registeredAt: v.number(),
}).index("by_clientId", ["clientId"]),
```

## New files — `packages/backend/convex/mcp/`

| File             | Role                                                                                                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oauth.ts`       | Public `authorize` mutation (called from web; uses `ctx.auth.getUserIdentity()` for clerkUserId; validates `redirectUri` against `client.redirectUris`; inserts `mcpAuthCodes` row with 5-min TTL). `internalMutation`s: `registerClient`, `consumeAuthCode`, `cleanupExpired`. `internalQuery`: `getClient` (with 24h TTL gate). |
| `native.ts`      | `httpAction`s only: `oauthMetadata`, `protectedResourceMetadata`, `register`, `authorizeGet` (302 → web), `token` (handles both `authorization_code` + `refresh_token`), `mcpHandler`, `health`. NO `authorizePost` (web app calls `authorize` mutation directly).                                                                |
| `nodeActions.ts` | `"use node"` actions: `issueTokens`, `verifyAccessToken` (verifies via `jsonwebtoken` + optional Clerk `getUser` re-check), `refreshToken`, `handleMcpRequest`. NO `verifyClerkTokenAction` / `getClerkPublishableKey` (web app handles Clerk).                                                                                   |
| `tools.ts`       | `registerTools(server, clerkUserId, ctx)` — 10 tools, each `ctx.runAction(internal.*)`.                                                                                                                                                                                                                                           |
| `resources.ts`   | `registerResources(server, clerkUserId, ctx)` — 1 resource (`vmem://context_prompt`), calls `internal.contextPromptApi.mcpGetContextPrompt`.                                                                                                                                                                                      |

## Existing files — modify

1. **`schema.ts`** — add 2 tables above.
2. **`http.ts`** — delete **11** `/api/mcp/*` routes (lines 182–450 area). Add: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/mcp/oauth/register` (POST), `/mcp/oauth/authorize` (GET only — 302 redirect), `/mcp/oauth/token` (POST), `/mcp` (POST/GET/DELETE), `/health` (GET). Handlers from `./mcp/native`.
3. **`neo4jActions/mcp.ts`** — refactor 5 actions (`mcpSearchMemories`, `mcpRetrieveMemories`, `mcpCreateMemory`, `mcpUpdateMemory`, `mcpDeleteMemory`): drop `args.token`, add `args.clerkId`. Delete `verifyTokenOrThrow` helper + `verifyMcpJwt` import.
4. **`mcpProfiles.ts`** — same refactor: `mcpListProfiles`, `mcpGetActiveProfile`, `mcpWhoami`.
5. **`mcpSkills.ts`** — same: `mcpListSkills`, `mcpGetSkill`.
6. **`contextPromptApi.ts`** — refactor `mcpGetContextPrompt`: drop `args.token`/`verifyMcpJwt`, add `args.clerkId`. Returns same `{ content, generatedAt, isPlaceholder }`.
7. **`packages/backend/package.json`** — add: `@modelcontextprotocol/sdk: catalog:`, `zod: catalog:`, `@clerk/backend: catalog:`. (`jsonwebtoken: catalog:` already present.)
8. **`packages/backend/src/neo4j/mcpAuth.ts`** — DELETE. After steps 3–6 nothing imports it.
9. **`apps/mcp/README.md`** — top-of-file deprecation banner pointing at new Convex URL.

## Web app additions — `apps/web/`

10. **`apps/web/src/routes/mcp/oauth/authorize.tsx`** _(new)_ — TanStack file route. `validateSearch: mcpOauthParamsSchema`. `beforeLoad` calls `saveMcpOauthParams(search)` to persist params (Clerk live-key handshake can strip them mid-flow). Gates on `useAuth().isSignedIn` (Clerk, NOT Convex auth — see conductor's comment on why). When signed-in + `useConvexAuth().isAuthenticated`, calls `useMutation(api.mcp.oauth.authorize)({clientId, redirectUri, codeChallenge, codeChallengeMethod})`, then `clearMcpOauthParams()`, then `window.location.replace(redirect_uri + ?code=...&state=...)`. Mirrors `C:\Vedant\Personal\GitHub\conductor\apps\web\src\routes\mcp\oauth\authorize.tsx` verbatim.
11. **`apps/web/src/lib/mcpOauthStorage.ts`** _(new)_ — `mcpOauthParamsSchema` (Zod, 5 fields: client_id, redirect_uri, state, code_challenge, code_challenge_method), `saveMcpOauthParams`, `saveMcpOauthParamsFromUrl`, `consumeMcpOauthParams` (with `MAX_ATTEMPTS=2` loop guard), `clearMcpOauthParams`. Backed by `sessionStorage` under key `mcp_oauth_pending`. Mirror conductor verbatim.
12. **`apps/web/src/main.tsx`** — call `saveMcpOauthParamsFromUrl()` BEFORE the ClerkProvider mounts (so params survive Clerk's redirect bounces).

## Surface registered in MCP server — 10 tools + 1 resource

| Surface                          | Internal action                                 |
| -------------------------------- | ----------------------------------------------- |
| tool `ping`                      | none (local)                                    |
| tool `whoami`                    | `internal.mcpProfiles.mcpWhoami`                |
| tool `list_profiles`             | `internal.mcpProfiles.mcpListProfiles`          |
| tool `memory_search`             | `internal.neo4jActions.mcp.mcpSearchMemories`   |
| tool `memory_retrieve`           | `internal.neo4jActions.mcp.mcpRetrieveMemories` |
| tool `memory_add`                | `internal.neo4jActions.mcp.mcpCreateMemory`     |
| tool `memory_update`             | `internal.neo4jActions.mcp.mcpUpdateMemory`     |
| tool `memory_delete`             | `internal.neo4jActions.mcp.mcpDeleteMemory`     |
| tool `skills_list`               | `internal.mcpSkills.mcpListSkills`              |
| tool `skills_get`                | `internal.mcpSkills.mcpGetSkill`                |
| resource `vmem://context_prompt` | `internal.contextPromptApi.mcpGetContextPrompt` |

Tool args (Zod schemas) copied verbatim from `apps/mcp/src/tools.ts` lines 36–258. Resource registration copied from `apps/mcp/src/resources.ts` lines 19–51 (preserves text/markdown mimeType + graceful-fallback unwrap).

## Implementation patterns (from conductor)

- **Stateless transport**: `new McpServer()` per request inside `handleMcpRequest`. `new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })`. Build a Web Standard `Request` with `content-type: application/json` + `accept: application/json, text/event-stream`, then `transport.handleRequest(req, { parsedBody })`. Returns `{ status, body }` to the calling httpAction.
- **`mcpHandler` httpAction flow**: extract Bearer → `ctx.runAction(internal.mcp.nodeActions.verifyAccessToken, { token })` → if null, return 401 with `WWW-Authenticate: Bearer resource_metadata="..."` → else `ctx.runAction(internal.mcp.nodeActions.handleMcpRequest, { clerkUserId, body: JSON.stringify(parsedBody) })` → return Response with returned body + status. GET/DELETE → 405.
- **PKCE in `token` httpAction**: Web Crypto `crypto.subtle.digest("SHA-256", encoder.encode(code_verifier))` → `btoa(String.fromCharCode(...hashArray))` → base64url replace. No node import. Compare to stored `codeChallenge`.
- **Auth code generation in `authorize` mutation**: `crypto.getRandomValues(new Uint8Array(32))` → hex. Works in V8 mutation runtime.
- **JWT** (in `nodeActions.ts`, `"use node"`): `jsonwebtoken` HS256 with `MCP_JWT_SECRET`. `issueTokens` returns `{ access_token, token_type: "Bearer", expires_in: 30*24*60*60, scope: "claudeai", refresh_token }`. `verifyAccessToken` does `jwt.verify(token, secret)` → reads `payload.sub` (or `payload.clerkUserId` legacy compat — match `verifyMcpJwt` current behavior).
- **`authorizeGet`**: validates query schema, calls `internal.mcp.oauth.getClient` to confirm client exists, builds `${WEB_APP_URL}/mcp/oauth/authorize?<params>`, returns `Response.redirect(target, 302)`.
- **`authorize` public mutation**: gets `ctx.auth.getUserIdentity()` (throws if null), looks up client in `mcpClientRegistrations`, validates `client.redirectUris.includes(redirectUri)` (when registered URIs non-empty), generates code, inserts `mcpAuthCodes` row, returns `{ code }`.
- **`consumeAuthCode` mutation**: deletes the row regardless of expiry (atomic cleanup), returns null if expired, else returns the entry sans `_id`.
- **`getClient` query 24h TTL**: returns null if `Date.now() - registeredAt > 24h`.
- **`cleanupExpired` mutation**: separate internalMutation that scans+deletes expired codes & clients. Wired to NO cron in v1; available for manual trigger if backlog grows.

## Convex env vars

- `MCP_JWT_SECRET` — must equal current Railway value (existing tokens stay valid).
- `CLERK_SECRET_KEY` — required for MCP bearer verification (`verifyAccessToken` re-checks the Clerk user exists). Without it, OAuth succeeds but `/mcp` returns 401 and Claude shows "Authorization with the MCP server failed".
- `WEB_APP_URL` — used by `authorizeGet` to build redirect target. Add for prod + dev.

(Plan does NOT need `CLERK_PUBLISHABLE_KEY` in Convex env because the inline-HTML approach is gone.)

## Critical reference files

- `C:\Vedant\Personal\GitHub\conductor\packages\backend\convex\mcp\native.ts` — http handlers (esp. `authorizeGet` 302 pattern + `token` PKCE)
- `C:\Vedant\Personal\GitHub\conductor\packages\backend\convex\mcp\nodeActions.ts` — `issueTokens`, `verifyAccessToken`, `handleMcpRequest` (~lines 920–1002)
- `C:\Vedant\Personal\GitHub\conductor\packages\backend\convex\mcp\oauth.ts` — public `authorize` mutation (lines 18–65), `consumeAuthCode` atomic delete (lines 90–114), `getClient` 24h TTL (lines 140–163)
- `C:\Vedant\Personal\GitHub\conductor\packages\backend\convex\mcp\tools.ts` — `registerTools` shape (`server, credentials, ctx`)
- `C:\Vedant\Personal\GitHub\conductor\apps\web\src\routes\mcp\oauth\authorize.tsx` — Clerk gate + mutation call + redirect
- `C:\Vedant\Personal\GitHub\conductor\apps\web\src\lib\mcpOauthStorage.ts` — sessionStorage recovery for popup-strip resilience

## Verification (visual, no curl)

1. `cd packages/backend && npx convex codegen --typecheck enable` — clean.
2. `cd apps/web && npx tsc --noEmit` — clean.
3. `npx convex dev` — confirm new routes register in logs.
4. Browser → `https://<slug>.convex.site/.well-known/oauth-authorization-server` → JSON metadata renders.
5. Claude.ai → Connectors → remove old Railway → add `https://<slug>.convex.site/mcp` → 302 to `${WEB_APP_URL}/mcp/oauth/authorize` → Clerk gate → approve → connector "connected".
6. In a Claude chat run each tool: `whoami`, `list_profiles`, `memory_add`, `memory_search`, `memory_retrieve`, `memory_update`, `memory_delete`, `skills_list`, `skills_get`. All succeed.
7. Confirm Claude reads the resource `vmem://context_prompt` at conversation start (markdown profile shows up implicitly — same as today via Express).
8. Convex dashboard → `mcpAuthCodes` rows appear during auth flow + disappear after `consumeAuthCode`. `mcpClientRegistrations` row created during dynamic registration.
9. Existing Claude connectors (still using Railway-issued JWTs signed with same `MCP_JWT_SECRET`) continue to work post-cutover without re-auth.

## Deferred / follow-up PRs

- Auth code GC cron (only if `mcpAuthCodes` table starts bloating in prod).
- Delete `apps/mcp/` folder + Railway deployment after prod soak.
- SDK version bump.
- Custom Convex domain for MCP URL (vanity).

## Unresolved

None.
