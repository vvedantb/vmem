# Add OneDrive + Linear connectors

## Context

vmem ships Google Drive + Notion as working connectors. OneDrive is seeded as a "Coming Soon" stub (no `provider` field); Linear doesn't exist yet. Goal: make both fully functional, reusing the existing Google/Notion pattern end-to-end — no new abstractions, minimal diff.

Scope locked by user:

- **OneDrive**: personal only. Scopes `Files.Read.All offline_access`. Root folder only. Filetypes `.txt`, `.md`, `.docx` (docx via Graph `?format=text`).
- **Linear**: issues + inline comments + projects (projects as separate memories, `sourceType: "linear_project"`). Default sync = last 30d; optional "Sync all history" via split-button.

## Verification vs user spec

Line numbers drifted ~5–25 lines from spec but all structures match. Corrected refs below. One pre-existing gap flagged: `Provider` type in `connectorOAuth.ts` lacks `"gmail"` (in schema but not OAuth). Out of scope for this change.

## Files

All backend paths under `packages/backend/convex/`; frontend under `apps/web/src/components/`.

### 1. `schema.ts` (lines 43–48)

Extend `connectors.provider` union additively:

```ts
provider: v.optional(v.union(
  v.literal("google_drive"),
  v.literal("notion"),
  v.literal("gmail"),
  v.literal("onedrive"),
  v.literal("linear"),
)),
```

### 2. `connectors.ts`

- **Line 5**: extend `ConnectorProvider` with `"onedrive" | "linear"`.
- **Lines 23–26**: existing OneDrive stub → add `provider: "onedrive"`. Keep `icon: "IconBrandOnedrive"`.
- **After Notion entry (~line 22)**: insert Linear default:
  ```ts
  { name: "Linear", description: "Sync issues, comments, and projects from Linear", icon: "IconBrandLinear", provider: "linear" }
  ```
- `seedDefaults` (**lines 70–106**) already patches `provider` on rows with matching name + missing provider → existing OneDrive rows auto-upgrade; no change.
- `migrateAddProviders` (**lines 239–258**): extend name→provider map with `"OneDrive" → "onedrive"` and `"Linear" → "linear"` for safety backfill.

### 3. `connectorOAuth.ts`

- **Line 10**: extend `Provider` with `"onedrive" | "linear"`.
- **Lines 19–31** `PROVIDER_CONFIGS`: append
  ```ts
  onedrive: {
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    revokeUrl: null,
    scopes: ["Files.Read.All", "offline_access"],
  },
  linear: {
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    revokeUrl: "https://api.linear.app/oauth/revoke",
    scopes: ["read"],
  },
  ```
- **`startOAuth` (lines 41–109)**: add 2 branches.
  - **OneDrive**: URLSearchParams like Google → `client_id` (env `MICROSOFT_CLIENT_ID`), `redirect_uri`, `response_type=code`, `scope` (space-joined), `state`, `prompt=consent`, `response_mode=query`.
  - **Linear**: `client_id` (env `LINEAR_CLIENT_ID`), `redirect_uri`, `response_type=code`, `scope=read`, `state`, `prompt=consent`.
- **`handleCallbackInternal` (lines 194–347)**: add 2 branches after Notion.
  - **OneDrive**: `POST` form-urlencoded `client_id/client_secret/code/redirect_uri/grant_type=authorization_code/scope`. Response shape mirrors Google (`access_token`, `refresh_token`, `expires_in`). Encrypt + `storeTokensInternal`. Envs: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`.
  - **Linear**: `POST` form-urlencoded standard. Response has `access_token`, `expires_in` (10yr), `scope`; no refresh token. Store like Notion: `refreshToken: ""`, `expiresAt: 0`. Envs: `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`.
- **`disconnect`**: OneDrive = no-op. Linear = best-effort `POST revokeUrl` with `access_token` in try/catch.

### 4. `connectorSync.ts`

- **Refresh block (lines 48–108)**: generalize condition from `provider === "google_drive"` to `(provider === "google_drive" || provider === "onedrive")`. Branch token URL + client envs inside. **Microsoft rotates refresh tokens** — if `refreshData.refresh_token` present, re-encrypt + persist; else keep existing. Linear skips refresh path (no expiry).
- **Scheduler switch (lines 122–144)**: add
  ```ts
  else if (connector.provider === "onedrive") {
    await retrier.run(ctx, internal.neo4jActions.connectorSync.syncOneDriveInternal, { clerkId, connectorId, accessToken });
  } else if (connector.provider === "linear") {
    await retrier.run(ctx, internal.neo4jActions.connectorSync.syncLinearInternal, { clerkId, connectorId, accessToken, fullHistory: args.fullHistory ?? false });
  }
  ```
- **`startSync` args (line 11)**: add `fullHistory: v.optional(v.boolean())`. Ignored for non-Linear providers.

### 5. `neo4jActions/connectorSync.ts`

Raw `fetch` for both. No new deps. Mirror existing patterns exactly (progress every 10 items; `updateSyncProgressInternal` for progress/idle/error; `getOrCreateDefaultByClerkIdInternal` for `profileId`; content truncated to 50,000 chars).

**`syncOneDriveInternal`** — mirrors `syncGoogleDriveInternal` (lines 18–142).

- Args: `{ clerkId, connectorId, accessToken }`.
- List: `GET https://graph.microsoft.com/v1.0/me/drive/root/children?$top=100` + `Authorization: Bearer`. Paginate via `@odata.nextLink`.
- Filter: items with `file` property (skip folders — MVP root only) AND `file.mimeType ∈ { text/plain, text/markdown, application/vnd.openxmlformats-officedocument.wordprocessingml.document }`.
- Content: `GET /me/drive/items/{id}/content?format=text` → plain text for `.docx`; raw body for `.txt`/`.md`.
- Upsert:
  ```ts
  await service.upsertFromSource({
    userId: args.clerkId,
    profileId,
    title: item.name,
    content: text.slice(0, 50000),
    sourceType: "onedrive",
    sourceId: item.id,
    sourceUrl: item.webUrl,
  });
  ```

**`syncLinearInternal`** — mirrors `syncNotionInternal` (lines 188–330).

- Args: `{ clerkId, connectorId, accessToken, fullHistory: v.boolean() }`.
- `filterDate = fullHistory ? null : new Date(Date.now() - 30*24*3600*1000).toISOString()`.
- **Issues query** (paginated, 50/page):
  ```graphql
  query ($after: String, $filter: IssueFilter) {
    issues(first: 50, after: $after, filter: $filter) {
      nodes {
        id
        identifier
        title
        description
        url
        updatedAt
        comments(first: 50) {
          nodes {
            body
            user {
              name
            }
            createdAt
          }
        }
        project {
          id
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
  ```
  `filter = filterDate ? { updatedAt: { gte: filterDate } } : undefined`.
- Per issue: `title = \`${identifier} ${title}\``. Content assembly:
  - Base = `description ?? ""`.
  - If comments present: append `"\n\n---\nComments:\n" + comments.map(c => \`[${c.user.name}] ${c.body}\`).join("\n\n")`.
  - If resulting content is empty (no description, no comments): fall back to `content = title` (user decision: title-only placeholder over skip).
  - Upsert `sourceType: "linear"`, `sourceId: id`, `sourceUrl: url`.
- **Projects query** (paginated): `projects(first: 50, after: $after) { nodes { id name description url updatedAt state } pageInfo { ... } }`. Apply 30d filter server-side via `filter: { updatedAt: { gte: filterDate } }` if Linear supports it on `projects`; else client-side. Upsert `sourceType: "linear_project"`, title `"Project: " + name`, content `description + "\nState: " + state`.
- Progress: sum `issuesDone + projectsDone` as `totalSynced`; progress % updates every 10 combined items.

`sourceType` is free-form string in `MemoryService.upsertFromSource` (Neo4j, no schema constraint) — no migration needed for `"onedrive" | "linear" | "linear_project"`.

### 6. `apps/web/src/components/ConnectorCard.tsx` + new `LinearIcon.tsx`

- Create `apps/web/src/components/LinearIcon.tsx` — inline SVG from svgl.app. Props: `{ size?: number; className?: string }`. Default export. Pattern-match existing `svg-animations/AnimatedBellIcon.tsx` but static (no motion).
- In `ConnectorCard.tsx` (**lines 24–34 `iconMap`**): import `LinearIcon` and add `"IconBrandLinear": LinearIcon`. Existing `IconBrandOnedrive` already in map — no change.
- **Sync button (lines 185–198)**: branch on `connector.provider === "linear"`:
  - Linear: split-button — primary Button click = fire `startSyncAction({ connectorId, fullHistory: false })` directly (GitHub/Vercel convention). Adjacent chevron-icon `DropdownMenuTrigger` opens menu with two items: `"Sync recent (30d)"` (fullHistory: false) + `"Sync all history"` (fullHistory: true). Rendered as a visually-attached pair (no gap, shared border radius on outer edges).
  - Other providers: unchanged single "Sync Now" button.
- `DropdownMenu` + related primitives already exported from `@vmem/ui` (`packages/ui/src/ui/dropdown-menu.tsx`) — usage pattern in `Chat.tsx:21–31`.

### 7. Env vars

User sets via `npx convex env set …` in `packages/backend`:

- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (single Azure AD app, reusable for future Outlook/Teams)
- `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`

OAuth redirect URI to register in both consoles: `${CONVEX_SITE_URL}/api/auth/connector/callback` (identical to Google/Notion).

## Reused utilities (zero new code)

- `encryptToken` / `decryptToken` / `getEnvOrThrow` — `convex/lib/crypto.ts:31/42/6`
- `insertOAuthStateInternal` / `consumeOAuthStateInternal` — `connectorOAuth.ts`
- `storeTokensInternal` / `getEncryptedTokensInternal` / `deleteTokensInternal` — `connectorTokens.ts:10/42/52`
- `markConnectedInternal` / `markDisconnectedInternal` / `updateSyncProgressInternal` — `connectors.ts:211–235`
- `MemoryService.upsertFromSource` — `packages/backend/src/neo4j/memoryService.ts:335–393`
- `getOrCreateDefaultByClerkIdInternal` — `profiles.ts`
- HTTP callback `/api/auth/connector/callback` — unchanged, provider-agnostic
- `OAuthModal`, `BrowseConnectorsModal`, `ConnectorCard` chrome — provider-agnostic, no change beyond iconMap + sync-button branch

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — passes.
2. `npx convex dev` pushes schema + code.
3. Set all 4 env vars via `npx convex env set …`.
4. Register redirect URI in Azure AD app + Linear OAuth app consoles.
5. Web app → Settings → Connectors:
   - OneDrive card flips from "Coming Soon" → "Connect".
   - Linear card renders with inline SVG + "Connect".
6. OneDrive: Connect → Microsoft consent → callback → "Connected" via live query → Sync Now → progress bar → memories appear with `sourceType: "onedrive"`.
7. Linear: Connect → Linear consent → callback → connected. Split button:
   - Primary "Sync recent (30d)" → recent issues + projects.
   - Dropdown "Sync all history" → full backfill.
   - Verify `sourceType: "linear"` (issues) and `sourceType: "linear_project"` (projects) memories.
8. Disconnect both — `connectorTokens` row deleted, status resets.
9. Force OneDrive token expiry (patch `expiresAt: 0` via Convex dashboard) → trigger sync → refresh path runs, new `refresh_token` persists, sync succeeds without reconnect.

## Finalization

Run after all verification steps above pass:

10. `/changelog` — invoke the `changelog` skill to document OneDrive + Linear connector addition in the project changelog.
11. `/ship` — invoke the `ship` skill to stage relevant files, commit with a conventional-commit message (e.g. `feat: add OneDrive and Linear connectors`), and push to remote.

## Out of scope

- SharePoint/Sites (OneDrive personal only).
- OneDrive recursive folder walk.
- OneDrive xlsx/pptx/pdf.
- Linear team-picker UI (sync all accessible teams).
- Microsoft token revocation on disconnect.
- Fixing pre-existing `"gmail"` omission from `Provider` type in `connectorOAuth.ts`.

## Unresolved questions

1. **Linear projects filter**: Linear's `projects` query supports `updatedAt` filter arg directly on the root query? If yes → server-side; if no → fetch all, filter client-side before upsert. I'll hit the schema at implementation time and pick server-side where possible. Not a blocker.
