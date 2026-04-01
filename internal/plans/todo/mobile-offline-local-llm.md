# Mobile Offline Mode with Local LLM

## Context

When the mobile app loses internet, it's completely dead — no chat, no memory access, nothing. This plan adds offline support: auto-detect no connection → switch to a local LLM running on-device → search locally cached memories → same chat UI, no changes to MessageBubble or ChatInput.

## Package: `@react-native-ai/llama`

Callstack's wrapper around `llama.rn` that adds Vercel AI SDK compatibility. The codebase already uses AI SDK types (`UIMessage`, `useUIMessages`, `useSmoothText`) via `@convex-dev/agent/react`, so using `@react-native-ai/llama` means the local LLM produces the same message types — zero UI changes needed.

**Why not alternatives:**

- `llama.rn` (raw): No AI SDK compat — would need manual streaming/message bridging
- `react-native-executorch`: .pte format (fewer models than GGUF), no AI SDK compat
- `@react-native-ai/apple`: iOS 26+ only, kills Android
- `@react-native-ai/mlc`: 179MB package, curated model list less flexible than GGUF

## Architecture

```
Online:  ChatInput → Convex mutation → vmemAgent (OpenRouter) → UIMessage stream
Offline: ChatInput → AI SDK useChat → @react-native-ai/llama (local Llama 3.2 3B) → UIMessage stream
```

Both paths produce `UIMessage[]` → same `MessageBubble` renders both.

## Decisions Made

- **Model**: Llama 3.2 3B Q4 GGUF (~2GB), downloaded on first launch
- **Model delivery**: Download on first launch (not bundled — 2GB would bloat App Store)
- **Local search**: SQLite FTS5 (not vector embeddings) — matches existing Neo4j fulltext approach, saves 260MB embedding model
- **Memory source**: Neo4j memories only (not chat history) — cached from Hono API
- **Sync strategy**: Delta sync with `updatedSince` param on Hono API
- **Offline detection**: Auto-detect via `@react-native-community/netinfo`
- **Offline chat history**: Sync back to Convex when online via `importOfflineMessages` mutation

---

## Phase 0: Prerequisites

### 0.1 Enable New Architecture

- **File**: `apps/mobile/app.json`
- Add `"newArchEnabled": true` under `expo.android` and `expo.ios`
- Required by `@react-native-ai/llama` (uses TurboModules)

### 0.2 Switch to Custom Dev Client

- Can no longer use Expo Go (native C++ code in llama.rn)
- Run `npx expo prebuild` to generate native projects
- Add `expo-dev-client` dependency
- Update `app.json` plugins: add `@react-native-ai/llama` plugin

### 0.3 Install Dependencies

```
pnpm add @react-native-ai/llama expo-sqlite expo-file-system @react-native-community/netinfo --filter mobile
```

---

## Phase 1: Network Detection

### 1.1 NetworkProvider Context

- **New file**: `apps/mobile/src/providers/NetworkProvider.tsx`
- Wrap app with `NetInfo` listener
- Expose `isOnline` boolean via React context
- Use `useSyncExternalStore` with NetInfo subscription (not useState)

### 1.2 Insert into Provider Tree

- **File**: `apps/mobile/app/_layout.tsx`
- Current: `ClerkProvider > ConvexProviderWithClerk > Slot`
- New: `ClerkProvider > ConvexProviderWithClerk > NetworkProvider > Slot`

### 1.3 Offline Indicator

- **File**: `apps/mobile/app/(main)/_layout.tsx`
- Small banner/pill when offline: "Offline mode — using local AI"

---

## Phase 2: Local Memory Cache (SQLite + FTS5)

### 2.1 Database Setup

- **New file**: `apps/mobile/src/db/local-db.ts`
- Use `expo-sqlite` (built into Expo)
- Tables: `memories` (id, title, content, type, status, confidence, tags, timestamps), `memories_fts` (FTS5 virtual table), `sync_meta`

### 2.2 Memory Sync Service

- **New file**: `apps/mobile/src/services/memory-sync.ts`
- Delta sync: `GET /v1/memories?updatedSince=<iso>` — only fetch changes
- First sync: full fetch, subsequent: delta only
- Handle deletions via `deletedIds` array in API response
- Run on app launch + every 5 minutes while online

### 2.3 Hono API Change

- **File**: `apps/api/src/routes/memories.ts`
- Add optional `updatedSince` query param + `deletedIds` in response

### 2.4 Local Search

- **New file**: `apps/mobile/src/services/local-search.ts`
- Replicate scoring from `apps/api/src/db/memory-service.ts`:
  - `totalScore = fulltextScore * 0.5 + recencyScore * 0.25 + confidenceScore * 0.25`
  - Recency buckets: <1d→1.0, <7d→0.9, <30d→0.7, <90d→0.5, else→0.3
- FTS5 MATCH + normalize rank + boost pinned + filter suppressed/expired

---

## Phase 3: Model Management

### 3.1 Model Download Service

- **New file**: `apps/mobile/src/services/model-manager.ts`
- Download Llama 3.2 3B Q4 GGUF (~2GB) from Hugging Face
- `expo-file-system` downloadAsync with progress
- States: `not_downloaded | downloading | ready | error`
- Resume support

### 3.2 Settings Tab + Model Download UI

- **New file**: `apps/mobile/app/(main)/settings.tsx`
- **File**: `apps/mobile/app/(main)/_layout.tsx` — add Settings tab
- Model status, download/delete buttons, progress bar

---

## Phase 4: Offline Chat Provider

### 4.1 LLM Context Manager

- **New file**: `apps/mobile/src/services/llm-context.ts`
- Initialize `@react-native-ai/llama` with downloaded GGUF
- Config: context 4096, temp 0.7, top_p 0.9

### 4.2 useChatProvider Hook

- **New file**: `apps/mobile/src/hooks/useChatProvider.ts`
- Returns: `{ messages, sendMessage, isStreaming, isReady, mode }`
- Online: delegates to Convex (existing flow)
- Offline: search local SQLite → inject into system prompt → local llama via AI SDK useChat

### 4.3 Refactor ChatScreen

- **File**: `apps/mobile/app/(main)/index.tsx`
- Replace direct Convex calls with `useChatProvider()` hook
- Everything else unchanged — same FlatList, MessageBubble, ChatInput

---

## Phase 5: Offline → Online Chat Sync

### 5.1 Local Message Storage

- **New file**: `apps/mobile/src/db/local-messages.ts`
- SQLite `offline_messages` table: id, role, content, createdAt, synced flag

### 5.2 Sync Service

- **New file**: `apps/mobile/src/services/message-sync.ts`
- On reconnect: push unsynced messages to Convex via `importOfflineMessages`
- Mark as synced, show toast

### 5.3 Backend Mutation

- **File**: `packages/backend/convex/chat.ts`
- New `importOfflineMessages` authMutation: bulk-inserts messages without triggering agent

---

## Phase 6: UX Polish

- Mode transition toasts
- Offline empty state variant
- "Model not ready" state when offline without downloaded model

---

## V1 Limitations

- Read-only memory access offline (no create/edit/delete)
- No tool calling from local LLM
- Memory cache may be stale (last sync timestamp shown in settings)
- 3B model quality < cloud model quality
- Context window limited to 4096 tokens

## Files Summary

| File                                                | Action | Phase |
| --------------------------------------------------- | ------ | ----- |
| `apps/mobile/app.json`                              | Modify | 0     |
| `apps/mobile/package.json`                          | Modify | 0     |
| `apps/mobile/src/providers/NetworkProvider.tsx`     | Create | 1     |
| `apps/mobile/app/_layout.tsx`                       | Modify | 1     |
| `apps/mobile/app/(main)/_layout.tsx`                | Modify | 1, 3  |
| `apps/mobile/src/db/local-db.ts`                    | Create | 2     |
| `apps/mobile/src/services/memory-sync.ts`           | Create | 2     |
| `apps/mobile/src/services/local-search.ts`          | Create | 2     |
| `apps/api/src/routes/memories.ts`                   | Modify | 2     |
| `apps/mobile/src/services/model-manager.ts`         | Create | 3     |
| `apps/mobile/app/(main)/settings.tsx`               | Create | 3     |
| `apps/mobile/src/services/llm-context.ts`           | Create | 4     |
| `apps/mobile/src/hooks/useChatProvider.ts`          | Create | 4     |
| `apps/mobile/app/(main)/index.tsx`                  | Modify | 4     |
| `apps/mobile/src/db/local-messages.ts`              | Create | 5     |
| `apps/mobile/src/services/message-sync.ts`          | Create | 5     |
| `packages/backend/convex/chat.ts`                   | Modify | 5     |
| `apps/mobile/app/(main)/_components/EmptyState.tsx` | Modify | 6     |
