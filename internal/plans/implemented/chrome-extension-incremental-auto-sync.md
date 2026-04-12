# Chrome Extension: Incremental + Auto-Sync

## Context

Currently bookmarks/history sync is fully manual — user clicks a button, extension re-sends ALL items to the API (backend deduplicates via 409). Wasteful and requires user action. We need:

1. **Auto-sync** — bookmarks sync on creation (event-driven), history syncs every 30 min (alarm-driven)
2. **Incremental sync** — both manual and auto only process items added since last sync

## Decisions

- Auto-sync **enabled by default** on install
- History alarm interval: **30 minutes**
- Lock contention → UI shows **"Sync in progress"** (not silent 0)
- Bookmark scope: **onCreated only** (no edit/move sync yet)

---

## Changes

### 1. `manifest.json` — add `alarms` permission

Add `"alarms"` to `permissions` array.

### 2. `src/types/storage.ts` — expand storage interface

Add to `ExtensionStorage`:

```
lastBookmarkSync: number   // epoch ms, 0 = never
lastHistorySync: number    // epoch ms, 0 = never
autoSyncEnabled: boolean   // default true
```

Add matching defaults to `STORAGE_DEFAULTS`. No migration needed — `chrome.storage.local.get(defaults)` returns default for missing keys.

### 3. New file: `src/background/sync-lock.ts` (~20 lines)

Two independent in-memory boolean locks (bookmarks, history). Four exports:

- `acquireBookmarkLock(): boolean`
- `releaseBookmarkLock(): void`
- `acquireHistoryLock(): boolean`
- `releaseHistoryLock(): void`

Returns `false` if already held. Service worker restart resets to `false` (correct — no sync survives restart).

### 4. `src/background/import-bookmarks.ts` — incremental + lock + single-item sync

**`importBookmarks()` changes:**

- Acquire lock at top, release in `finally`. Return `{ imported: number; locked: boolean }` instead of bare `number` — `locked: true` when lock not acquired.
- Read `lastBookmarkSync` from storage
- Add `dateAdded: number` to `FlatBookmark`, populate from `node.dateAdded ?? 0` in `flattenBookmarks`
- After flattening, filter: `b.dateAdded > lastBookmarkSync`
- After loop completes, `setStorage({ lastBookmarkSync: Date.now() })`

**New export: `syncSingleBookmark(id: string, bookmark: chrome.bookmarks.BookmarkTreeNode)`**

- For `chrome.bookmarks.onCreated` listener
- Check `autoSyncEnabled` + `authToken` from storage, bail if false/empty
- Skip if no `bookmark.url` (folders)
- Acquire bookmark lock, bail if held
- Build folder path by walking `chrome.bookmarks.get(parentId)` up to root
- Single `createMemory()` call
- Update `lastBookmarkSync` on success
- Release lock in `finally`

### 5. `src/background/import-history.ts` — incremental + lock

**`importHistory(days?: number)` changes:**

- Make `days` optional
- Acquire lock at top, release in `finally`. Return `{ imported: number; locked: boolean }`.
- Read `lastHistorySync` from storage
- `startTime` logic:
  - If `days` provided (manual): `Math.max(Date.now() - days * 86400000, lastHistorySync)` — never re-sends already-synced items
  - If no `days` (auto-sync): use `lastHistorySync` directly (or `Date.now() - 30 * 60000` if 0, to avoid fetching entire history on first auto-sync tick)
- After loop, `setStorage({ lastHistorySync: Date.now() })`
- Add `silent` param to skip `chrome.runtime.sendMessage` progress during auto-sync (popup not open → sendMessage throws)

### 6. New file: `src/background/sync-scheduler.ts` (~35 lines)

Constants: `HISTORY_ALARM_NAME = "vmem-history-sync"`, `INTERVAL = 30` (minutes)

**`startAutoSync()`:**

- Register `chrome.bookmarks.onCreated` → calls `syncSingleBookmark`
- `chrome.alarms.create(HISTORY_ALARM_NAME, { periodInMinutes: 30 })`
- Register `chrome.alarms.onAlarm` → if name matches, check `autoSyncEnabled` + `authToken`, call `importHistory()` (no days)
- Store listener refs in module scope for cleanup

**`stopAutoSync()`:**

- `chrome.bookmarks.onCreated.removeListener(...)`
- `chrome.alarms.clear(HISTORY_ALARM_NAME)`

Both idempotent. `chrome.alarms.create` is idempotent for same name.

### 7. `src/background/index.ts` — register scheduler on startup

- `onInstalled`: after `registerContextMenu()`, read `autoSyncEnabled` → if true, `startAutoSync()`
- Add `chrome.runtime.onStartup` — same check + `startAutoSync()`. Needed because alarms persist across restarts but listeners don't.
- Add `chrome.storage.onChanged` listener — watch `autoSyncEnabled` flips: true → `startAutoSync()`, false → `stopAutoSync()`

### 8. `src/types/messages.ts` — no new message types needed

Existing `IMPORT_RESULT` already has optional `skipped?: number`. We'll use the existing `error` field or add a `locked: boolean` to signal contention. Actually simpler: change `IMPORT_RESULT` to add optional `locked?: boolean`.

### 9. `src/background/message-handler.ts` — pass through lock status

When `importBookmarks()` / `importHistory()` return `{ locked: true }`, return `{ type: "IMPORT_RESULT", success: true, count: 0, locked: true }`.

### 10. `src/popup/_components/ImportPanel.tsx` — toggle + status display

- Read `autoSyncEnabled`, `lastBookmarkSync`, `lastHistorySync` from storage on mount
- Add auto-sync toggle switch at top of panel (writes `setStorage({ autoSyncEnabled })` on change)
- Below each section header, show "Last synced: X minutes ago" or "Never synced" based on timestamps
- Change button labels: "Import All Bookmarks" → "Sync Bookmarks", "Import History" → "Sync History"
- Handle `locked: true` in result → show "Sync already in progress" instead of "Imported 0"

---

## Implementation Order

1. `types/storage.ts` (foundation)
2. `sync-lock.ts` (new, no deps)
3. `import-bookmarks.ts` (incremental + syncSingleBookmark)
4. `import-history.ts` (incremental + silent mode)
5. `manifest.json` (add alarms)
6. `types/messages.ts` (add locked field)
7. `message-handler.ts` (pass through lock status)
8. `sync-scheduler.ts` (new, wires events + alarms)
9. `index.ts` (register scheduler)
10. `ImportPanel.tsx` (UI toggle + status)

## Edge Cases Handled

- **First sync** (`lastSync === 0`): filter passes everything through → full import, same as today
- **Auto + manual overlap**: lock prevents concurrent runs, UI shows "Sync in progress"
- **Service worker restart**: `onStartup` re-registers listeners; alarms persist automatically
- **Not logged in**: auto-sync checks `authToken`, skips if empty
- **Folder bookmark**: `syncSingleBookmark` checks `bookmark.url`, skips folders
- **Popup closed during auto-sync**: `silent` param skips `sendMessage` (avoids throw)

## Verification

1. Build extension: `cd apps/chrome-extension && pnpm build`
2. Load unpacked in Chrome → verify `alarms` permission accepted
3. Click "Sync Bookmarks" → should import all (first time). Click again → should import 0 (incremental).
4. Add a new bookmark in Chrome → check vmem API received it (auto-sync via onCreated)
5. Wait 30 min (or manually trigger alarm in devtools) → verify history synced
6. Toggle auto-sync off → verify alarm cleared, bookmark listener removed
7. Run `npx tsc` in extension dir to verify types
