# Move Enrichment from Local LLM to OpenRouter (Server-Side)

## Context

Local WebLLM enrichment (Qwen3-0.6B) in the Chrome extension is unreliable — the model is too small for structured JSON output, produces `<think>` tags that break parsing, and fails to download on poor connections. Moving enrichment to a server-side Convex action calling OpenRouter (Qwen3-235B-A22B) gives dramatically better quality at negligible cost (~$0.00015/memory). The extension already has a proven pattern for this in `createMemoryInternal` (embedding generation).

## Decisions

- **Model:** `qwen/qwen3-235b-a22b-instruct-2507` (already used in entity backfill)
- **pendingMemoryEnrichment table:** Delete entirely — server-side enrichment is fire-and-forget
- **Public auth endpoints:** Delete both `applyEnrichment` and `listRecentMemoryTitlesForEnrichment` from `memoryApi.ts` — re-add if needed later
- **Web app WebLLM:** Keep untouched (used for chat/voice, not enrichment)

## Plan

### Phase 1: Add server-side enrichment action

**Modify: `packages/backend/convex/neo4jActions/enrichment.ts`**

Add `enrichMemoryInternal` internalAction alongside existing `applyEnrichmentInternal`:

1. Resolve `OPENROUTER_API_KEY` via `tryUserEnvVarByClerkId()` — skip gracefully if missing
2. Fetch recent memory titles via `service.getRecentMemoryTitles(clerkId, memoryId)`
3. Build prompt via `buildFullEnrichmentPrompt(title, content, existingMemories)`
4. Call OpenRouter — reuse exact fetch pattern from `migration.ts:390-410`:
   - Endpoint: `https://openrouter.ai/api/v1/chat/completions`
   - Model: `qwen/qwen3-235b-a22b-instruct-2507`
   - System message: "Respond with ONLY valid JSON. No thinking, no markdown."
   - Temperature: 0.1
   - Headers: Authorization, HTTP-Referer, X-Title
5. Parse via `parseFullEnrichmentResponse()`
6. Apply via `service.applyEnrichment()` (tags, relatedIds, entities)
7. Log event via `pushEventInternal` with source `"server-enrichment"`

Wrap entire handler in try/catch — enrichment failure must never break memory creation.

### Phase 2: Trigger enrichment after memory creation

**Modify: `packages/backend/convex/neo4jActions/memories.ts` — `createMemoryInternal`**

After the `pushEventInternal` call (line 130), add:

```ts
await ctx.scheduler.runAfter(
  0,
  internal.neo4jActions.enrichment.enrichMemoryInternal,
  {
    clerkId: args.clerkId,
    memoryId: result.id,
    title: args.title,
    content: args.content,
  },
);
```

Remove:

- `queueForLocalEnrichment` arg from action args
- `pendingEnrichment.enqueuePendingInternal` call and its conditional

### Phase 3: Strip local enrichment from Chrome extension

**Delete 8 files:**

- `apps/chrome-extension/src/background/enrichment-router.ts`
- `apps/chrome-extension/src/background/chrome-ai-enrichment.ts`
- `apps/chrome-extension/src/background/offscreen-manager.ts`
- `apps/chrome-extension/src/background/pending-enrichment-drain.ts`
- `apps/chrome-extension/src/offscreen/index.ts`
- `apps/chrome-extension/src/offscreen/index.html`
- `apps/chrome-extension/src/offscreen/enrichment-engine.ts`
- `apps/chrome-extension/src/offscreen/webllm-worker.ts`

**Modify `apps/chrome-extension/src/background/message-handler.ts`:**

- Remove imports: `applyEnrichment`, `listRecentMemoryTitlesForEnrichment`, enrichment-router imports, `drainPendingEnrichmentQueue`
- Delete `enrichMemoryLocally()` function
- Remove 4× `void enrichMemoryLocally(...)` calls (after SAVE_PAGE, SAVE_YOUTUBE_VIDEO, CAPTURE_PROMPT, SAVE_SELECTION)
- Remove `GET_ENRICHMENT_STATUS` and `LOAD_ENRICHMENT_MODEL` from HANDLED_TYPES + their switch cases

**Modify `apps/chrome-extension/src/background/index.ts`:**

- Remove `initializeEnrichment` + `drainPendingEnrichmentQueue` imports and calls (onInstalled + onStartup)

**Modify `apps/chrome-extension/src/types/messages.ts`:**

- Remove from ContentMessage: `GET_ENRICHMENT_STATUS`, `LOAD_ENRICHMENT_MODEL`
- Remove from BackgroundResponse: `ENRICHMENT_STATUS`, `MODEL_LOAD_RESULT`
- Remove from ProgressMessage: `MODEL_LOAD_PROGRESS`

**Modify `apps/chrome-extension/src/lib/storage.ts` (or `types/storage.ts`):**

- Remove `localEnrichmentEnabled` from interface + defaults

**Modify `apps/chrome-extension/src/popup/_components/SettingsForm.tsx`:**

- Remove "Local AI tagging" section (toggle, status badge, progress bar, load button)
- Remove enrichment-related state (`enrichmentStatus`, `loadProgress`, `localEnrichmentEnabled`), effects, handlers (`handleLoadModel`, `getStatusBadge`)

**Modify `apps/chrome-extension/src/background/api-client.ts`:**

- Remove: `listRecentMemoryTitlesForEnrichment()`, `applyEnrichment()`, `listPendingEnrichment()`, `removePendingEnrichment()`

**Modify `apps/chrome-extension/manifest.json`:**

- Remove `"offscreen"` from permissions

**Modify `apps/chrome-extension/scripts/build.ts`:**

- Remove offscreen build step

**Modify `apps/chrome-extension/vite.config.ts`:**

- Remove `createOffscreenConfig()` function + its reference in the export

**Modify `apps/chrome-extension/package.json`:**

- Remove `@mlc-ai/web-llm` dependency

### Phase 4: Clean up Convex backend

**Delete: `packages/backend/convex/pendingEnrichment.ts`** — entire file

**Modify: `packages/backend/convex/memoryApi.ts`:**

- Delete `listRecentMemoryTitlesForEnrichment` authAction
- Delete `applyEnrichment` authAction
- Keep `createMemory` authAction (remove `queueForLocalEnrichment` arg)

**Modify: `packages/backend/convex/schema.ts`:**

- Remove `pendingMemoryEnrichment` table definition + indexes

**Keep existing `applyEnrichmentInternal`** in `enrichment.ts` — the new `enrichMemoryInternal` calls `service.applyEnrichment()` directly, but `applyEnrichmentInternal` is still useful as a standalone "apply pre-computed enrichment" action.

### Phase 5: DO NOT touch

- `apps/web/src/lib/webllm-worker.ts` — web app chat/voice
- `apps/web/src/lib/local-engine.ts` — web app local LLM
- `packages/backend/src/enrichmentPrompt.ts` — still used by server-side enrichment

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — no type errors
2. `cd apps/chrome-extension && npm run build` — extension builds without offscreen/webllm
3. Save a memory via extension → Convex dashboard shows `enrichMemoryInternal` scheduled action
4. Memory gets tags within seconds (visible in web dashboard)
5. Web app local LLM chat still works (unaffected)
