# Remove Cloud Chat — Local LLM Only

## Context

Chat has dual-mode: cloud (OpenRouter via Convex Agent) and local (WebLLM in browser). Goal: remove the cloud chat path so chat is local-only. OpenRouter stays in `apps/api` for memory enrichment only.

## Scope

- **Remove**: cloud chat UI toggle, cloud chat hook, cloud streaming backend, agent.ts entirely, `@openrouter/ai-sdk-provider` from backend, embeddings
- **Keep**: `saveLocalMessages`, `getOrCreateThread` (refactored to use standalone `createThread`), `listThreadMessages`, `getThreadMessageUsage`, thread persistence
- **Keep**: OpenRouter in `apps/api` only (memory enrichment — separate from Convex)

---

## Web App Changes

### 1. DELETE `apps/web/hooks/useCloudChat.ts`

### 2. DELETE `apps/web/hooks/useChatProvider.ts`

### 3. DELETE `apps/web/app/(main)/chat/_components/ProviderToggle.tsx`

### 4. Modify `apps/web/hooks/useLocalChat.ts`

- Remove `threadId` param → hook calls `getOrCreateThread` internally (same pattern cloud hook used)
- Expose `threadId` and `isReady` (ready = thread loaded + engine ready)
- Keep all local inference logic unchanged

### 5. Modify `apps/web/components/Chat.tsx`

- Remove imports: `useCloudChat`, `useChatProvider`, `ProviderToggle`
- Call `useLocalChat()` only (no args)
- Remove provider branching logic
- Remove `<ProviderToggle />` from footer
- When no model loaded: show empty state "Load a local model in Settings → Preferences to start chatting" with link to `/settings/preferences`
- Loading spinner while thread is being created

### 6. Modify `apps/web/app/(main)/chat/_components/ChatMessageItem.tsx`

- Remove `"vmem"` (cloud) case from `getProviderMeta()` — keep `"vmem-local"` + `"vmem-local-voice"`
- Remove `IconCloud` import

### 7. Modify `packages/backend/convex/chat.ts`

- Remove `initiateStreaming` mutation
- Remove `streamAsync` internal action
- Remove `vmemAgent` import
- Refactor `getOrCreateThread`: use standalone `createThread` from `@convex-dev/agent` + `components.agent.threads.listThreadsByUserId` directly
- Keep: `saveLocalMessages`, `getThreadMessageUsage`, `listThreadMessages`

### 8. DELETE `packages/backend/convex/agent.ts`

- `languageModel` is required by Agent constructor → can't make a bare agent
- Use standalone functions (`createThread`, `saveMessage`, `listUIMessages`, `syncStreams`) from `@convex-dev/agent` instead — they only need `components.agent`
- These are already imported in `chat.ts` for `saveLocalMessages`

### 9. Cleanup

- Remove `@openrouter/ai-sdk-provider` from `packages/backend/package.json`
- Remove `OPENROUTER_API_KEY` from backend env config (keep in `apps/api/.env.local`)
- Update `apps/docs/quickstart.mdx` — remove "OpenRouter API key" from prerequisites if it only mentioned it for chat

---

## Mobile App Plan (implement after web)

### Current state

`apps/mobile/src/hooks/useChatProvider.ts` — 3 modes: `"online" | "offline" | "offline_no_model"`. Online mode calls `api.chat.initiateStreaming` which will no longer exist.

### Changes

1. **`apps/mobile/src/hooks/useChatProvider.ts`** — collapse to 2 modes: `"ready" | "no_model"`. Remove all online/cloud logic: `sendOnlineMessage`, `onlineMessages`, `onlineStreaming`, network-gated mode switching. Always use local model.
2. **Add message persistence**: after local inference completes and device is online, call `saveLocalMessages` to sync to Convex thread (same as web). Need `getOrCreateThread` when online.
3. **Remove network dependency** from chat mode selection (keep `NetworkProvider` for other features).
4. **UX**: remove online/offline indicators in chat. Show model name + "Local" badge.

---

## Verification

1. `npx tsc` in `apps/web` — no type errors
2. `cd packages/backend && npx convex codegen --typecheck enable` — no Convex type errors
3. `/chat` with no model → empty state with Settings link
4. Load WebLLM model → local chat works, messages stream, persist to thread
5. No "cloud", "OpenRouter", or provider toggle in chat UI
6. Historical cloud messages (agentName "vmem") still render in thread
7. Memory enrichment (`apps/api`) still works
