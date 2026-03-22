# Connector Sync: Google Drive, Notion, Gmail

**Date:** 2026-03-22
**Status:** Draft

## Goal

Pull content from Google Drive, Notion, and Gmail into vmem as first-class Memory nodes — searchable, tagged, and linked in the graph like any manually-created memory. Think Obsidian's "second brain" but with external sources feeding in automatically.

## Architecture

```
Frontend "Sync Now"
  → Convex mutation: mark connector as syncing (reject if already syncing)
  → Hono API: POST /v1/connectors/:id/sync
    → Call Convex action to decrypt OAuth tokens
    → Fetch content from provider API (Google/Notion/Gmail)
    → For each batch of ~10 items:
      → Upsert Memory nodes in Neo4j (dedup by sourceId)
      → Queue enrichment for new memories (post-sync, not inline)
      → Batch-update Convex connector progress
    → Mark connector as idle + update lastSyncAt/itemsSynced
    → Trigger enrichment for all newly created memories
```

Manual sync only — no crons, no webhooks.

## Schema Changes

### Convex: New `connectorTokens` table

```ts
connectorTokens: defineTable({
  connectorId: v.id("connectors"),
  accessToken: v.string(), // AES-GCM encrypted
  refreshToken: v.string(), // AES-GCM encrypted
  expiresAt: v.number(),
  tokenType: v.string(),
  scope: v.string(),
}).index("by_connector", ["connectorId"]);
```

**Encryption boundary:** All encryption/decryption happens inside Convex actions (matching the existing `apiKeys` pattern). The `ENCRYPTION_KEY` env var lives only in the Convex environment.

- **Store tokens:** Hono sends plaintext tokens to a Convex action (`connectorTokens.storeTokens`) which encrypts and inserts. This is a public action (not `internalAction`) protected by the existing `CONVEX_EVENT_SECRET` shared-secret pattern from `apps/api/src/lib/convex.ts`. The action validates the secret before proceeding.
- **Read tokens:** Hono calls a Convex action (`connectorTokens.getDecryptedTokens`) which decrypts and returns plaintext tokens. Same shared-secret protection.
- **Refresh tokens:** Hono refreshes with provider, then calls the store action again to re-encrypt.

Note: These are regular Convex actions (callable via `ConvexHttpClient` + `anyApi`), not `internalAction`, since Hono needs to call them over HTTP. The shared secret acts as the auth layer.

### Convex: Add `provider` field to `connectors` table

```ts
connectors: defineTable({
  // ...existing fields...
  provider: v.optional(
    v.union(v.literal("google_drive"), v.literal("notion"), v.literal("gmail")),
  ),
  sharedTokenConnectorId: v.optional(v.id("connectors")),
});
```

`sharedTokenConnectorId`: set on the Gmail connector when it reuses Google Drive's tokens (or vice versa).

Only the three providers being implemented. Union expands when new providers ship.

**Migration:** `provider` added as `v.optional(...)` first. A migration function backfills based on `name` field mapping (`"Google Drive"` → `"google_drive"`, etc.). After migration, switch to required. Connectors without a matching provider (OneDrive, Dropbox, Slack, GitHub) keep `provider: undefined` — they remain display-only stubs with no sync capability.

### Convex: New `oauthStates` table (CSRF)

```ts
oauthStates: defineTable({
  state: v.string(),
  connectorId: v.id("connectors"),
  userId: v.id("users"),
  createdAt: v.number(),
}).index("by_state", ["state"]);
```

Short-lived rows (TTL ~10 minutes). Created when generating the OAuth URL, validated and deleted on callback. Abandoned states (user closes popup) cleaned up lazily: the `oauth/url` route deletes any `oauthStates` rows for the same user older than 10 minutes before creating a new one.

### Neo4j: Add source fields to Memory nodes

New properties on `Memory` nodes:

- `sourceType`: `"manual" | "google_drive" | "notion" | "gmail"`
- `sourceUrl`: original URL (already exists for URL dedup)
- `sourceId`: provider-specific ID (Google Doc ID, Notion page ID, Gmail message ID)
- `sourceSyncedAt`: timestamp of last sync for this specific memory

New index: `memory_source_id` on `(userId, sourceType, sourceId)` for fast upsert lookups.

## OAuth Flow

### Provider Setup

Each provider requires a Google Cloud / Notion developer app:

- **Google** (covers Drive + Gmail): OAuth 2.0 Web Application
  - Scopes: `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/gmail.readonly`
  - Single OAuth consent covers both Drive and Gmail connectors
- **Notion**: OAuth 2.0 Public Integration
  - Capabilities: Read content, Read user information

### Google Token Sharing (Drive + Gmail)

One Google OAuth consent produces tokens with both `drive.readonly` and `gmail.readonly` scopes. Token storage strategy:

- Tokens are stored under the **Google Drive** connector's `connectorTokens` row (the first one connected).
- When the user connects Gmail, the system checks if a Google Drive connector already has tokens with `gmail.readonly` scope. If so, Gmail reuses the same `connectorTokens` row (via a `sharedTokenConnectorId` field on the Gmail connector) — no second OAuth prompt.
- If Gmail is connected first, the reverse applies.
- Disconnect of either Google connector does NOT revoke tokens if the other is still connected. Only disconnect of the last Google connector revokes.

### Default Connectors Update

`seedDefaults` updated to include a Gmail connector:

```ts
{ name: "Gmail", description: "Sync emails from your Gmail inbox", icon: "IconBrandGmail", provider: "gmail" }
```

Existing Google Drive and Notion entries get their `provider` field added.

### Flow

1. User clicks "Connect" on a connector card
2. Frontend calls Hono: `GET /v1/connectors/oauth/url?connectorId=X`
   - Hono looks up the connector to determine provider
   - For Google connectors: checks if another Google connector already has valid tokens → if so, skip OAuth, reuse tokens, mark connected immediately
   - Otherwise: generates a random `state` string, stores it in Convex `oauthStates` table with `connectorId` + `userId`
   - Returns the provider's OAuth consent URL with `state` param
3. Frontend opens URL in `window.open()` popup (600x700)
4. User grants consent in the popup
5. Provider redirects to: `GET /v1/connectors/oauth/callback`
   - **Identity resolution:** Hono extracts `state` param, queries Convex `oauthStates` table to get `connectorId` + `userId`. This is how the unauthenticated callback identifies the user. If `state` not found or expired (>10 min), reject with error.
   - Exchanges auth code for tokens with provider
   - Calls Convex action `connectorTokens.storeTokens` (encrypts + stores)
   - Updates connector `connectionStatus` to `"connected"` in Convex
   - Deletes the `oauthStates` row
   - Returns HTML that calls `window.opener.postMessage({ type: "oauth-complete", success: true })` to notify the parent window
6. Frontend receives `postMessage`, closes popup, UI updates via Convex live query

### Token Refresh

Before each sync, Hono calls Convex action to get decrypted tokens + `expiresAt`. If expired, uses `refreshToken` to get new `accessToken` from provider, then calls Convex action to re-encrypt and store. If refresh fails, marks connector as `"disconnected"` with error message.

### Disconnect

Revokes token with provider API (only if no other Google connector shares the token), calls Convex mutation to delete `connectorTokens` row, resets connector status.

## Sync Engine

### New Hono Routes

```
GET  /v1/connectors/oauth/url        → Generate OAuth URL (authenticated via authMiddleware)
GET  /v1/connectors/oauth/callback    → Handle OAuth callback (NO authMiddleware — state-validated instead)
POST /v1/connectors/:id/sync          → Trigger sync (authenticated via authMiddleware)
POST /v1/connectors/:id/disconnect    → Revoke tokens + disconnect (authenticated via authMiddleware)
```

Auth middleware is applied selectively: `oauth/callback` is excluded since it's a redirect from the provider with no Bearer token. All other connector routes use the standard `authMiddleware`.

### Concurrency Guard

The Convex `sync` mutation rejects if `syncStatus` is already `"syncing"`. The Hono sync route also checks this before starting work. If the sync crashes (Hono process dies), a stale `"syncing"` status is recovered by the frontend: if `syncStatus` has been `"syncing"` for >5 minutes, show a "Sync may have failed" warning with a "Reset" button that sets status back to `"idle"`.

### Sync Service Interface

Each provider implements:

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

`connectorId` included so `onProgress` can update the correct Convex document.

### Progress Update Batching

`onProgress` calls are batched — Convex is updated every 10 items or every 5 seconds, whichever comes first. Not per-item.

### Google Drive Sync

1. `drive.files.list()` — filter `mimeType` to Google Docs, Sheets, Slides
2. For each file:
   - `drive.files.export()` as `text/plain`
   - Upsert Memory node: title = file name, content = exported text, sourceUrl = file webViewLink, sourceId = file ID, sourceType = "google_drive"
3. Batch progress updates

### Notion Sync

1. `notion.search()` with `filter: { property: "object", value: "page" }` — paginate through all pages
2. For each page:
   - `notion.blocks.children.list()` — recursively collect all blocks
   - Convert blocks to plain text (paragraphs, headings, lists, toggles, code blocks)
   - Upsert Memory node: title = page title, content = plain text, sourceUrl = page URL, sourceId = page ID, sourceType = "notion"
3. Batch progress updates

### Gmail Sync

1. `gmail.users.messages.list()` — paginate through inbox, **capped at 500 messages** per sync
   - Ordered by date descending (most recent first)
   - On first sync: last 90 days of messages (up to 500)
   - On re-sync: only messages newer than the connector's `lastSyncAt` timestamp (still capped at 500)
2. For each message:
   - `gmail.users.messages.get()` with `format: "full"`
   - Extract subject from headers, body from `text/plain` part (fallback to `text/html` stripped of tags)
   - **Content cap:** body truncated to 50KB per message
   - Upsert Memory node: title = subject, content = body, sourceUrl = Gmail web URL, sourceId = message ID, sourceType = "gmail"
3. Batch progress updates

### Upsert Logic

Primary lookup via new `findBySourceId(userId, sourceType, sourceId)` using the `memory_source_id` index:

- If Memory exists → update content + sourceSyncedAt
- If not → create new Memory node with source fields

### Enrichment Strategy

Enrichment runs **post-sync, not inline**. After all items are upserted, the sync service collects IDs of newly created memories (not updates) and triggers enrichment in batches of 5 with a 1-second delay between batches. This avoids overwhelming OpenRouter during large syncs.

## Frontend Changes

### OAuthModal → Real OAuth Popup

Replace the fake `setTimeout` flow:

1. Call `GET /v1/connectors/oauth/url?connectorId=X` to get the consent URL
2. If response says `alreadyConnected: true` (Google token sharing), skip popup — connector is connected immediately
3. Otherwise, open URL in `window.open()` popup (600x700)
4. Listen for `postMessage` from callback page
5. On success, Convex live query auto-updates connector status

### Source Badges

- Memory list view: small icon (Google Drive / Notion / Gmail) next to memory title
- Memory graph: node color or small icon overlay based on `sourceType`
- Memory detail panel: "Source" section showing provider + link to original

### ConnectorCard Updates

- Show provider-specific permissions text in OAuth modal (not generic "Read files")
- For Google: note that one consent covers both Drive and Gmail
- Stale sync detection: if `syncStatus === "syncing"` for >5 min, show warning + reset button

## File Structure

```
apps/api/src/
  routes/
    connectors.ts           # New: OAuth + sync routes
  services/
    sync/
      types.ts              # SyncService interface + SyncResult
      google-drive.ts       # Google Drive sync implementation
      notion.ts             # Notion sync implementation
      gmail.ts              # Gmail sync implementation
      token-manager.ts      # Token read/refresh via Convex actions
packages/backend/convex/
  connectorTokens.ts        # New: encrypt/decrypt/store/delete token actions
  schema.ts                 # Updated: add connectorTokens + oauthStates tables, provider field
  connectors.ts             # Updated: seedDefaults adds Gmail, provider field, concurrency guard
apps/api/src/
  db/
    memory-service.ts       # Updated: add source fields to MemoryNode, add findBySourceId()
apps/web/
  components/OAuthModal.tsx  # Updated: real popup OAuth flow
  components/ConnectorCard.tsx # Updated: source badge + stale sync warning + IconBrandGmail in iconMap
```

## Environment Variables (Hono API)

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=
```

No separate encryption key needed in Hono — encryption stays in Convex.

## Out of Scope

- Automatic/scheduled sync (crons, webhooks)
- Bidirectional sync (push back to providers)
- PDFs or non-native Google file types
- Notion database row-level sync (only pages)
- Gmail attachment extraction
- OneDrive, Dropbox, Slack, GitHub connectors (future)
- Incremental sync with change tokens / cursors (V2 optimization)
- Partial sync resumption on failure (V2)
