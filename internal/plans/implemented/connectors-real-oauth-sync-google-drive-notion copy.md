# Connectors: Real OAuth + Sync (Google Drive & Notion)

## Context

Connectors page is currently frontend-only — fake `setTimeout` OAuth, stub Convex mutations that toggle flags. User wants connectors that actually work: real OAuth popup → encrypted token storage → persist across sessions → sync content into Neo4j as memory nodes. Modelled after Claude's connector UX.

Providers: **Google Drive** + **Notion** first. Other 4 (OneDrive, Dropbox, Slack, GitHub) remain "Coming Soon" stubs.

---

## Phase 1 — Convex Schema & Token Storage

### 1A. Schema changes (`packages/backend/convex/schema.ts`)

Add `provider` + `sharedTokenConnectorId` to `connectors`:

```
provider: v.optional(v.union(v.literal("google_drive"), v.literal("notion"), v.literal("gmail")))
sharedTokenConnectorId: v.optional(v.id("connectors"))
```

New `connectorTokens` table:

```
connectorId: v.id("connectors")
accessToken: v.string()       // AES-GCM encrypted
refreshToken: v.string()      // AES-GCM encrypted (empty string for Notion)
expiresAt: v.number()
tokenType: v.string()
scope: v.string()
```

Index: `by_connector` on `["connectorId"]`

New `oauthStates` table:

```
state: v.string()
connectorId: v.id("connectors")
userId: v.id("users")
provider: v.string()
createdAt: v.number()
```

Index: `by_state` on `["state"]`

### 1B. Extract shared crypto (`packages/backend/convex/lib/crypto.ts`)

Move `getEncryptionKey`, `uint8ToBase64`, encrypt/decrypt helpers out of `apiKeys.ts` into shared module. Both `apiKeys.ts` and `connectorTokens.ts` import from here.

### 1C. Create `packages/backend/convex/connectorTokens.ts`

Pattern: actions do crypto → delegate DB writes to internal mutations (same as `apiKeys.ts`).

- `storeTokens` — public **action**, validates `CONVEX_EVENT_SECRET`, encrypts both tokens, calls `insertTokensInternal`
- `insertTokensInternal` — `internalMutation`, deletes existing row for connectorId, inserts new
- `getDecryptedTokens` — public **action**, validates secret, queries encrypted row, decrypts, returns plaintext
- `getEncryptedTokensInternal` — `internalQuery`, lookup by connectorId
- `deleteTokensBySecret` — public **action**, validates secret, calls `deleteTokensInternal`
- `deleteTokensInternal` — `internalMutation`, deletes row

OAuth state functions (can live in same file or separate `oauthStates.ts`):

- `createOAuthState` — public **mutation** with secret check, cleans up stale states (>10min) for same user, inserts new
- `validateOAuthState` — public **action** with secret check, queries by state string, validates not expired, deletes row, returns `{ connectorId, userId, provider }`

### 1D. Update `packages/backend/convex/connectors.ts`

- Add `provider` field to `DEFAULT_CONNECTORS` for Google Drive + Notion
- Add Gmail connector to defaults: `{ name: "Gmail", icon: "IconBrandGmail", provider: "gmail" }`
- `seedDefaults` inserts `provider` field
- Add `markConnectedBySecret` — public mutation with secret check (Hono calls this after OAuth callback)
- Add `markDisconnectedBySecret` — public mutation with secret check
- Add `getByIdBySecret` — public query with secret check, returns connector doc (Hono needs provider info)
- Add `updateSyncProgress` — public mutation with secret check, updates `syncProgress`, `itemsSynced`, `syncStatus`, `lastSyncAt`

---

## Phase 2 — Hono OAuth & Sync Routes

### 2A. Provider config (`apps/api/src/lib/oauth-providers.ts`)

```ts
const PROVIDERS = {
  google_drive: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  },
  notion: {
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    revokeUrl: null, // Notion has no revocation endpoint
    scopes: [],
  },
};
```

Helper functions: `buildAuthUrl(provider, state, redirectUri)`, `exchangeCode(provider, code, redirectUri)`, `revokeToken(provider, accessToken)`.

Notion token exchange uses Basic auth header (`base64(client_id:client_secret)`), Google uses POST body.

### 2B. Convex client helpers (`apps/api/src/lib/convex-connectors.ts`)

Thin wrappers around `ConvexHttpClient` + `anyApi` for all connector-related Convex calls. Handles passing `CONVEX_EVENT_SECRET` automatically.

### 2C. Connector routes (`apps/api/src/routes/connectors.ts`)

**`GET /oauth/url`** (with `authMiddleware`)

1. Read `connectorId` from query param
2. Query Convex for connector → get `provider`
3. Generate random `state` string
4. Store state in Convex `oauthStates`
5. Build provider auth URL with `state`
6. Return `{ url }` as JSON

**`GET /oauth/callback`** (**NO** `authMiddleware` — redirect from provider)

1. Extract `code` + `state` from query
2. Validate state via Convex → get `connectorId`, `userId`, `provider`
3. Exchange code for tokens with provider
4. Store encrypted tokens via Convex `storeTokens` action
5. Mark connector as connected via Convex `markConnectedBySecret`
6. Return HTML that `postMessage`s to opener + `window.close()`

**`POST /:id/disconnect`** (with `authMiddleware`)

1. Get decrypted tokens from Convex
2. Revoke with provider API (Google only; Notion has no revoke endpoint)
3. Delete tokens from Convex
4. Mark connector as disconnected

**`POST /:id/sync`** (with `authMiddleware`) — **fire-and-forget**

1. Mark connector as syncing via Convex
2. Return `202 Accepted` immediately
3. Background: get decrypted tokens (refresh if Google token expired)
4. Background: call provider-specific sync service
5. Background: batch-update progress in Convex every 10 items
6. Background: mark connector as idle + set `lastSyncAt` + `itemsSynced`
7. On error: mark connector syncStatus as "error" with errorMessage

Frontend tracks progress via Convex live query (already wired). No long-running HTTP connection.

### 2D. Register routes (`apps/api/src/index.ts`)

```ts
app.use("/connectors/oauth/url", authMiddleware);
app.use("/connectors/:id/*", authMiddleware);
// /connectors/oauth/callback intentionally excluded — state-validated instead
app.route("/connectors", connectors);
```

---

## Phase 3 — Sync Engine

### 3A. Sync types (`apps/api/src/services/sync/types.ts`)

```ts
interface SyncService {
  sync(params: {
    userId: string;
    connectorId: string;
    accessToken: string;
    onProgress: (synced: number, total: number) => Promise<void>;
  }): Promise<SyncResult>;
}

interface SyncResult {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ sourceId: string; error: string }>;
}
```

### 3B. Neo4j changes

Add new properties to Memory nodes: `sourceType`, `sourceId`, `sourceUrl`, `sourceSyncedAt`.

New index in `neo4j.ts` → `ensureIndexes()`:

```
CREATE INDEX memory_source_id IF NOT EXISTS FOR (m:Memory) ON (m.userId, m.sourceType, m.sourceId)
```

Add to `memory-service.ts`:

- `upsertFromSource(params)` — MERGE by `(userId, sourceType, sourceId)`, create or update content + `sourceSyncedAt`
- `findBySourceId(userId, sourceType, sourceId)` — lookup via index

### 3C. Google Drive sync (`apps/api/src/services/sync/google-drive.ts`)

1. `drive.files.list()` — Google Docs, Sheets, and Slides
2. For each file: `drive.files.export()` as `text/plain`
3. Upsert Memory node with `sourceType: "google_drive"`, `sourceId: fileId`, `sourceUrl: webViewLink`
4. Batch progress updates every 10 items

Uses `googleapis` npm package (`google.drive({ version: "v3" })` with OAuth2 client).

### 3D. Notion sync (`apps/api/src/services/sync/notion.ts`)

1. `notion.search()` with `filter: { property: "object", value: "page" }` — paginate
2. For each page: `notion.blocks.children.list()` → convert blocks to plain text
3. Upsert Memory node with `sourceType: "notion"`, `sourceId: pageId`, `sourceUrl: page.url`
4. Batch progress updates every 10 items

Uses `@notionhq/client` npm package.

### 3E. Token refresh (`apps/api/src/services/sync/token-manager.ts`)

Before each sync:

- Get decrypted tokens + `expiresAt` from Convex
- If Google token expired → POST to `https://oauth2.googleapis.com/token` with `grant_type=refresh_token` → re-store
- If refresh fails → mark connector disconnected with error
- Notion tokens don't expire — no refresh needed

---

## Phase 4 — Frontend Changes

### 4A. Rewrite `apps/web/components/OAuthModal.tsx`

Replace fake setTimeout with real popup flow:

1. User clicks "Authorize" → call `GET ${API_URL}/v1/connectors/oauth/url?connectorId=X` via `useAuthFetch`
2. `window.open(url, "oauth-popup", "width=600,height=700")`
3. Show "connecting" step while popup is open
4. Listen for `message` event with `{ type: "oauth-complete" }`
5. On success → "complete" step → `onComplete()` → close
6. Detect popup closed without completion → show error
7. Handle popup blocker (`popup === null`)

New props: `connectorId: Id<"connectors">`, `provider: string`

### 4B. Update `apps/web/components/ConnectorCard.tsx`

- Pass `connector._id` and `connector.provider` to OAuthModal
- Remove direct `connectMutation` call — Hono callback handles this, Convex live query auto-updates
- `handleDisconnect` → calls Hono `POST /v1/connectors/:id/disconnect` via `useAuthFetch` instead of bare Convex mutation
- `handleSync` → calls Hono `POST /v1/connectors/:id/sync` via `useAuthFetch`
- Hide "Connect" for connectors without `provider` → show "Coming Soon" badge
- Add stale sync detection: if `syncStatus === "syncing"` for >5min, show warning + "Reset" button
- Add `IconBrandGmail` to icon map

### 4C. Update `BrowseConnectorsModal.tsx`

Same changes as ConnectorCard — disable connect for stub connectors, pass new props to OAuthModal.

### 4D. Update connectors page

Minimal changes — Convex live query handles reactivity.

---

## Phase 5 — Migration & Seeding

- `provider` added as `v.optional(...)` initially
- Write a one-off migration function in `connectors.ts` that backfills existing connectors based on `name`:
  - `"Google Drive"` → `"google_drive"`, `"Notion"` → `"notion"`
- Run migration → then optionally tighten to required (or keep optional since 4 stubs have no provider)

---

## New Dependencies

- `googleapis` — Google Drive API client (in `apps/api`)
- `@notionhq/client` — Notion API client (in `apps/api`)

---

## Environment Variables

### Hono API (`apps/api/.env.local`)

```
GOOGLE_CLIENT_ID=            # Google Cloud Console → OAuth 2.0 Client
GOOGLE_CLIENT_SECRET=        # Same
GOOGLE_REDIRECT_URI=         # https://<API_DOMAIN>/v1/connectors/oauth/callback
NOTION_CLIENT_ID=            # Notion Developer → My Integrations
NOTION_CLIENT_SECRET=        # Same
NOTION_REDIRECT_URI=         # Same URL as Google — route disambiguates via state
FRONTEND_URL=                # For postMessage origin restriction
```

Already exist: `CONVEX_URL`, `CONVEX_EVENT_SECRET`, `ENCRYPTION_KEY` (Convex env).

### Google Cloud Console Setup

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create or select project
3. APIs & Services → Enable "Google Drive API"
4. Credentials → Create OAuth 2.0 Client ID (Web application)
5. Authorized redirect URIs: add `https://<API_DOMAIN>/v1/connectors/oauth/callback`
6. Copy Client ID + Secret to env vars
7. OAuth consent screen → Add test users (while in "Testing" mode)

### Notion Developer Setup

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Create "Public Integration"
3. Set redirect URI: `https://<API_DOMAIN>/v1/connectors/oauth/callback`
4. Capabilities: Read content, Read user information
5. Copy OAuth Client ID + Secret to env vars

---

## Files Summary

### New files

| File                                          | Purpose                               |
| --------------------------------------------- | ------------------------------------- |
| `packages/backend/convex/lib/crypto.ts`       | Shared AES-GCM encrypt/decrypt        |
| `packages/backend/convex/connectorTokens.ts`  | Token storage + OAuth state actions   |
| `apps/api/src/lib/oauth-providers.ts`         | Provider auth/token URLs + helpers    |
| `apps/api/src/lib/convex-connectors.ts`       | Convex client wrappers for connectors |
| `apps/api/src/routes/connectors.ts`           | Hono OAuth + sync routes              |
| `apps/api/src/services/sync/types.ts`         | SyncService interface                 |
| `apps/api/src/services/sync/google-drive.ts`  | Google Drive sync                     |
| `apps/api/src/services/sync/notion.ts`        | Notion sync                           |
| `apps/api/src/services/sync/token-manager.ts` | Token refresh logic                   |

### Modified files

| File                                                                            | Changes                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/backend/convex/schema.ts`                                             | +2 tables, +2 fields on connectors                           |
| `packages/backend/convex/connectors.ts`                                         | provider in defaults, secret-protected mutations, Gmail seed |
| `packages/backend/convex/apiKeys.ts`                                            | Import crypto from shared module                             |
| `apps/api/src/index.ts`                                                         | Register connector routes                                    |
| `apps/api/src/db/neo4j.ts`                                                      | Add `memory_source_id` index                                 |
| `apps/api/src/db/memory-service.ts`                                             | Add `upsertFromSource`, `findBySourceId`                     |
| `apps/web/components/OAuthModal.tsx`                                            | Real popup OAuth flow                                        |
| `apps/web/components/ConnectorCard.tsx`                                         | Hono API calls, provider gating, stale sync                  |
| `apps/web/app/(main)/settings/connectors/_components/BrowseConnectorsModal.tsx` | Same as ConnectorCard                                        |

---

## Implementation Order

1. Schema changes → everything depends on this
2. Shared crypto module → needed by step 3
3. `connectorTokens.ts` → token storage + OAuth state
4. `connectors.ts` updates → secret-protected mutations, provider defaults
5. `oauth-providers.ts` + `convex-connectors.ts` → provider config + Convex helpers
6. `connectors.ts` route (Hono) → OAuth flow
7. `index.ts` route registration
8. `OAuthModal.tsx` → real popup
9. `ConnectorCard.tsx` + `BrowseConnectorsModal.tsx` → wire up
10. Neo4j index + `memory-service.ts` upsert → sync target
11. Sync services (Google Drive + Notion) → actual content pull
12. Wire sync route in Hono

Steps 5 can run in parallel. Steps 8-9 can run in parallel with 10-12.

---

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — check Convex types
2. `npx tsc` in `apps/api` and `apps/web` — no type errors
3. Manual test: Settings → Connectors → Connect Google Drive → real Google consent popup → callback → status updates to "Connected" via live query
4. Manual test: Connect Notion → Notion auth page → callback → connected
5. Manual test: Sync Now on Google Drive → progress bar updates → items appear in memory graph
6. Manual test: Disconnect → tokens deleted, status reset
7. Stub connectors (OneDrive, Dropbox, Slack, GitHub) show "Coming Soon"
