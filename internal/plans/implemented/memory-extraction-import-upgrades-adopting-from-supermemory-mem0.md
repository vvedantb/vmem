# Memory Extraction & Import Upgrades — Adopting from supermemory & mem0

## Context

vmem currently captures memories from the chrome extension and connectors but lags both supermemory and mem0 on three fronts: (a) page extraction quality (raw `innerText` strip-list misses main-article content on modern SPAs), (b) conversation-fact extraction with conflict resolution (mem0's headline feature; vmem stores prompt captures verbatim), and (c) retrieval granularity (whole-memory only — long PDFs and articles can't be paragraph-addressed). This plan ports seven specific improvements without abandoning vmem's structural advantages (3-layer dedup, Neo4j entity graph, ProposedUpdate infrastructure already present).

The work is ordered by dependency — pure prompt rewrites first, schema additions next, then features that depend on them.

**User decisions made up-front (already locked):**

- V2 conflict UX: **async + always propose** (never silently merge or overwrite)
- Chunk strategy: **token sliding window, dual-embed** (memory-level + chunk-level both kept)
- `context_prompt`: **settings + pinned + LLM prose, cached, regenerated on memory write (debounced 1 min)**
- File upload scope: **PDF + TXT + MD only**, **Convex storage**, **keep blob + extracted text**
- V2 LLM pipeline: **two-stage** (extract atomic facts → decide ADD/UPDATE/DELETE/NONE per fact)
- V2 candidate retrieval: **hybrid retrieval (BM25 + vector + recency + confidence) top-10**

---

## Order of execution

1. **Item 3** — enrichment prompt rewrite (pure prompt edit; no deps)
2. **Item 4** — `externalId` exposed on public API (schema + API; needed by 11, future Twitter)
3. **Item 1** — Readability extraction (extension only; no backend deps)
4. **Item 7** — chunk-level storage (Neo4j schema + retrieval; used by 11)
5. **Item 11** — file upload (web app + new Convex action; depends on 7)
6. **Item 2** — V2 ADD/UPDATE/DELETE/NONE (depends on 4 for externalId; reuses existing ProposedUpdate)
7. **Item 10** — MCP `context_prompt` resource (independent; lightest touch, last)

---

## Item 3 — Detail-preservation rules in enrichment prompt

**Goal:** Replace the current 22-line tag/entity prompt with mem0's specificity-preserving guidance. Improves tag and entity extraction quality with zero infra change.

**Files:**

- `packages/backend/src/enrichmentPrompt.ts` — `buildFullEnrichmentPrompt`

**Steps:**

1. Edit `buildFullEnrichmentPrompt` to embed three new sections drawn from mem0's `ADDITIVE_EXTRACTION_PROMPT` (`mem0/configs/prompts.py:468-943`):
   - **"Preserve Specific Details"** (lines 640-666 of mem0's prompt): proper nouns, qualifiers, exact quantities, never-generalize.
   - **"No Fabrication"** (lines 679): every detail must trace to inputs.
   - **"No Implicit Attribute Inference"** (lines 680): don't infer gender/age from names.
2. Reword these so they apply to TAG and ENTITY extraction (not full-fact extraction): tags must include specific tech/org names not categories ("typescript" not "programming"), entities must use canonical full names ("Ferrari 488 GTB" not "sports car").
3. Keep the existing JSON output contract (`{tags, relatedMemoryIds, entities}`). Don't change `parseFullEnrichmentResponse`.
4. Add 2-3 worked examples to the prompt (mem0-style, format: input snippet → expected JSON).

**No schema, no API change. Pure string edit.**

---

## Item 4 — `externalId` idempotent imports

**Goal:** Expose the existing `(userId, sourceType, sourceId)` MERGE pattern (already used by `upsertFromSource` for connectors at `memoryService.ts:771`) to the public `createMemory` action so file uploads, future Twitter/GitHub imports, and any externally-IDed source can dedup without hashing.

**Files:**

- `packages/backend/convex/memoryApi.ts` — `createMemory` validator + handler
- `packages/backend/convex/neo4jActions/memories.ts` — `createMemoryInternal` (add Layer 0)
- `packages/backend/src/neo4j/memoryService.ts` — possibly add `findMemoryByExternalId` helper or reuse `upsertFromSource` semantics

**Steps:**

1. **Validator additions** in `memoryApi.ts:72`:
   - Add optional args: `externalId: v.optional(v.string())`, `sourceType: v.optional(v.string())`.
   - Forward to `createMemoryInternal`.
2. **Internal action** in `neo4jActions/memories.ts:40` — insert as **Dedup Layer 0** (before URL match):
   ```ts
   if (args.externalId && args.sourceType) {
     const existing = await service.findMemoryByExternalId(
       args.clerkId,
       args.sourceType,
       args.externalId,
     );
     if (existing) {
       await service.incrementVisitCount(args.clerkId, existing.id);
       const full = await service.getMemory(args.clerkId, existing.id);
       if (full) return full;
     }
   }
   ```
3. **MemoryService** — add `findMemoryByExternalId(userId, sourceType, sourceId)`:
   - Cypher: `MATCH (m:Memory {userId: $userId, sourceType: $sourceType, sourceId: $sourceId}) RETURN m LIMIT 1`.
   - The composite index `memory_source_id` (in `setup.ts:45-48`) already supports this.
4. **Memory creation** — when `externalId` + `sourceType` provided, store them as `m.sourceType` and `m.sourceId` on the Memory node (`createMemory` Cypher in `memoryService.ts:266`). These properties are the same shape as connectors use, so the existing index works.
5. **Type update** — Memory return shape already implicitly tolerates these fields (connector path writes them); confirm no breakage in `memoryFromRecord` mapping.

**Not in scope:** updating connectors (already use this). Updating extension save flow (no stable externalId for browser-saved pages — keep on URL+hash dedup).

---

## Item 1 — Mozilla Readability page extraction

**Goal:** Replace `extractPageData()`'s naive innerText with `@mozilla/readability` for main-article extraction; fall back to current strip-list when Readability returns nothing.

**Files:**

- `apps/chrome-extension/src/lib/page-extraction.ts` — refactor extraction
- `apps/chrome-extension/src/content/readability/index.ts` — **new** content script
- `apps/chrome-extension/manifest.json` — register content script
- `apps/chrome-extension/vite.config.ts` — add new entry to `createContentScriptConfig`
- `apps/chrome-extension/src/background/context-menu.ts:30`, `src/popup/_components/QuickSave.tsx:106`, `src/background/index.ts:27` — switch from `executeScript({func})` to message-passing into the new content script

**Critical constraint discovered:** `chrome.scripting.executeScript({ func })` serializes the function — imports cannot survive. Readability needs to live in a **bundled content script**, the same pattern as existing ChatGPT/Claude/YouTube content scripts.

**Steps:**

1. **Create new content script** `apps/chrome-extension/src/content/readability/index.ts`:
   - Listens for `EXTRACT_PAGE` messages from background.
   - Runs `new Readability(document.cloneNode(true)).parse()`.
   - On null/empty result OR very short result (<200 chars), falls back to the current strip-list logic (move logic from `page-extraction.ts:extractPageData` here).
   - Always also returns OG metadata, favicon, URL — same `ExtractedPageData` shape as today.
   - Returns combined result via `sendResponse`.
2. **Add Vite entry** in `vite.config.ts` `createContentScriptConfig` (line 63-86, follow ChatGPT/Claude pattern):
   - New entry: `content-readability` → `src/content/readability/index.ts`.
3. **Manifest update** — add to `content_scripts` array:
   ```json
   {
     "matches": ["<all_urls>"],
     "js": ["content-readability.js"],
     "run_at": "document_idle",
     "all_frames": false
   }
   ```
4. **Refactor callers** — replace `chrome.scripting.executeScript({ func: extractPageData })` with `chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE" })` at:
   - `background/context-menu.ts:30-32`
   - `popup/_components/QuickSave.tsx:106-109`
   - `background/index.ts:27` (savePageFromTab pathway)
5. **Keep `htmlToMarkdown`** in `lib/page-extraction.ts` — Turndown stays in background context where the API client lives, runs after we get the article HTML back from the content script.
6. **Delete (or shrink to wrapper)** `extractPageData` once all callers migrate.

**Edge case:** Readability mutates the document it's given — must `document.cloneNode(true)` first (Mozilla docs explicit on this). Don't operate on live DOM.

**Bundle size:** Readability is ~60 KB minified. Acceptable per-tab cost; only injected once via manifest, no per-page download.

---

## Item 7 — Chunk-level storage for long content

**Goal:** When memory content >2 KB, split into ~500-token sliding-window chunks (50-token overlap), embed each, store as `:Chunk` nodes linked to parent `:Memory`. Retrieval extends to also search chunks; chunk hits return the parent memory annotated with the matched-chunk snippet. Memory-level embedding stays (preserves Layer-3 semantic dedup, semantic edges, and existing recall behaviour).

**Files:**

- `packages/backend/src/neo4j/setup.ts` — add Chunk node + index + constraint
- `packages/backend/src/neo4j/memoryService.ts` — chunking logic + retrieval extension
- `packages/backend/src/neo4j/chunking.ts` — **new** pure utility
- `packages/backend/convex/neo4jActions/memories.ts` — call chunking after `createMemory`
- `packages/backend/convex/memoryApi.ts` — extend `RetrieveMemoriesResult` with optional `matchedChunk` field

**Schema additions:**

```cypher
// New node type
(:Chunk {
  id, memoryId, userId,
  position,        // 0-indexed sequence number within memory
  content,         // the chunk text (~500 tokens)
  startOffset,     // char offset in parent memory.content
  endOffset,
  embedding,       // 1536-dim, same model as memories
  createdAt
})

// New edge
(memory:Memory)-[:HAS_CHUNK {position}]->(chunk:Chunk)

// New indexes (in setup.ts):
CREATE VECTOR INDEX chunk_embedding ...   // 1536, cosine
CREATE FULLTEXT INDEX chunk_content ON Chunk(content)
CREATE INDEX chunk_user_memory ON :Chunk(userId, memoryId)
```

**Steps:**

1. **`chunking.ts`** new file — pure functions:
   - `shouldChunk(content: string): boolean` — true if `content.length > 2000` chars (rough proxy; tokenization deferred to keep it simple).
   - `chunkText(content: string): { content: string; startOffset: number; endOffset: number }[]` — sliding window. Use a token estimator (~4 chars/token); target 500-token chunks (~2000 chars), 50-token overlap (~200 chars). Snap to whitespace boundaries to avoid mid-word splits. Return positions.
   - No external dep; keep it dead simple.
2. **`memoryService.ts`** — add `createChunksForMemory(memoryId, userId, chunks, embeddings)`:
   - Single Cypher `UNWIND` to insert all chunks + edges in one round-trip.
3. **`enrichmentService.ts` or `embeddingService.ts`** — add `generateEmbeddings(apiKey, texts: string[])` for batch embedding (existing service is single-text only — extend or wrap).
4. **`createMemoryInternal`** in `convex/neo4jActions/memories.ts:170` — after `service.createMemory(...)`, schedule chunk-pipeline:
   - Call `shouldChunk`. If true, schedule a new internal action `chunkMemoryInternal` via `ctx.scheduler.runAfter(0, ...)`. Memory creation still returns immediately.
   - The async action: chunks the text → batch-embeds → calls `service.createChunksForMemory`.
   - Errors are best-effort logged (memory-level retrieval still works without chunks).
5. **Retrieval extension** — `retrieveMemoriesInternal` in `memoryService.ts:1140`:
   - Add a 4th leg: chunk-level vector search via `chunk_embedding` index, top-K chunks.
   - For each chunk hit, look up its parent memory; if parent already in fulltext/vector results, attach `matchedChunk: { content, position }` to that memory candidate (enriches existing result). If parent NOT in results, add a new candidate seeded by the chunk hit (and `trace.reason = "chunk-match"`).
   - RRF fusion: include chunk hits in rank-fusion alongside memory hits, but chunk score scaled by 0.85 (slightly down-weight to favor whole-memory matches when both available).
6. **`MemoryCandidate` type** — add optional `matchedChunk?: { content: string; position: number }` field. Document in `RetrieveMemoriesResult`.
7. **Memory deletion** — when a `:Memory` is deleted, cascade-delete its `:Chunk` nodes (existing delete Cypher in `memoryService.ts` — extend `DETACH DELETE` to also match chunks via `HAS_CHUNK`).
8. **Migration** — existing memories don't have chunks. Add a one-shot migration action `backfillChunksInternal(clerkId)` that finds all user memories with `length(content) > 2000` and chunks them. **Per CLAUDE.md migration rules**: define as Convex internal action, run manually post-deploy, then leave the function in place until verified.

---

## Item 11 — File upload (PDF / TXT / MD)

**Goal:** Add a file picker to `AddMemoryForm` that uploads a file to Convex storage, extracts text server-side, and creates a memory (which automatically chunks if >2KB via item 7).

**Files:**

- `apps/web/src/components/AddMemoryForm.tsx` — add file input + UI state
- `apps/web/src/components/AddMemoryModal.tsx` — surface in quick-add too
- `apps/web/src/components/contexts/MemoryContext.tsx` — add `uploadMemoryFile` hook
- `packages/backend/convex/memoryApi.ts` — new mutations/actions
- `packages/backend/convex/fileImport.ts` — **new** file (or co-locate in memoryApi)
- `packages/backend/convex/schema.ts` — extend Memory representation with optional `storageId`
- `packages/backend/src/parsers/` — **new** directory: `pdf.ts`, `text.ts`

**Steps:**

1. **Schema** in `schema.ts`:
   - Memory metadata in Convex is minimal (most lives in Neo4j). Add nothing to Convex schema.
   - On the Neo4j Memory node, add optional properties: `storageId` (Convex `_storage` ID as string), `mimeType`, `originalFilename`. Update `MemoryNode` interface in `memoryService.ts:14`.
2. **Upload URL action** in `convex/memoryApi.ts`:
   - New `mutation` (auth-gated): `generateMemoryUploadUrl()` → `await ctx.storage.generateUploadUrl()` → returns signed URL.
3. **File-import action** in new `convex/fileImport.ts` (must be `"use node"` for parsers):
   - `importMemoryFromFile({ storageId, filename, mimeType, profileId? })` (auth action):
     - `await ctx.storage.get(storageId)` → returns Blob.
     - Detect type by extension + mimeType: `.pdf` → `pdf.ts`, `.md`/`.txt` → `text.ts`. Reject anything else with clear error.
     - Extract text. Take first 200 chars (or filename if extraction fails) as title.
     - Hash extracted text → use as `externalId` with `sourceType: "file-upload"` so re-uploading the same file dedups.
     - Forward to `createMemoryInternal` with: title, content, type "knowledge", source "file-upload", tags `[mimeType, "upload"]`, confidence 1.0, externalId, sourceType, plus pass `storageId`/`mimeType`/`originalFilename` through to MemoryService for storage on the Neo4j node.
     - Return the created memory.
4. **Parsers** in new `packages/backend/src/parsers/`:
   - `pdf.ts`: use [`pdf-parse`](https://www.npmjs.com/package/pdf-parse). Wraps single function `extractPdfText(blob: Blob): Promise<string>`.
   - `text.ts`: trivial — `await blob.text()`. Used for `.txt` and `.md`.
   - Add `pdf-parse` to `packages/backend/package.json` dependencies.
5. **Web app — `MemoryContext.tsx`**:
   - Add `uploadMemoryFile(file: File, profileId?: string)`:
     - Calls `useAction(api.memoryApi.generateMemoryUploadUrl)` → POST file to URL → receives `{ storageId }`.
     - Calls `useAction(api.fileImport.importMemoryFromFile)` with `{ storageId, filename: file.name, mimeType: file.type, profileId }`.
     - Returns `{ memoryId }` for navigation.
6. **Web app — `AddMemoryForm.tsx`**:
   - Add `<input type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" />`.
   - Show file name + size + "Upload" button when selected.
   - On upload: progress state, disable text field, on success navigate to memory detail OR show success toast and reset.
   - Validate: max size 25 MB (Convex storage default upper bound is 1 GB but PDFs >25 MB are usually problematic).
7. **Big files automatic chunking** — handled by item 7's `shouldChunk(content)`. A 100-page PDF extracted to 80 KB of text will trigger chunking automatically. No special path.
8. **Original blob preview UI** (deferred polish): `apps/web/src/routes/_main/memories/$id.tsx` — when memory has `storageId`, render a "View original" link that calls `ctx.storage.getUrl(storageId)`. Out of scope for this plan but the `storageId` field makes it possible later.

**Not in scope:** DOCX, XLSX, CSV, images. Defer.

---

## Item 2 — Mem0 V2 ADD/UPDATE/DELETE/NONE on prompt-capture

**Goal:** When the chrome extension sends a `CAPTURE_PROMPT` (single user prompt from ChatGPT/Claude/T3), run a two-stage LLM pipeline: (1) extract atomic facts, (2) for each fact, decide ADD/UPDATE/DELETE/NONE against top-10 hybrid-retrieved candidates. ADDs become new memories. UPDATEs and DELETEs become **proposals** in the existing `:ProposedUpdate` infrastructure — surfaced in a new dashboard inbox for user approval. Pure capture saves the original prompt as before; this runs async on top.

**Files:**

- `packages/backend/src/v2Prompt.ts` — **new** prompt builder + parser (mem0-derived)
- `packages/backend/convex/neo4jActions/factExtraction.ts` — **new** internal action
- `packages/backend/convex/neo4jActions/memories.ts` — schedule fact-extraction after prompt-capture saves
- `packages/backend/src/neo4j/memoryService.ts` — add `createProposedDelete`, extend `createProposedUpdate` if needed
- `packages/backend/convex/proposedUpdateApi.ts` — already public (verify shape returned to client)
- `apps/web/src/routes/_main/proposals.tsx` — **new** route (approval inbox)
- `apps/web/src/components/ProposalsList.tsx` — **new** component
- `apps/web/src/components/contexts/NotificationContext.tsx` (or new ProposalsContext) — add proposal hooks
- Sidebar — add Proposals link with unresolved-count badge

**Pipeline shape (new internal action `extractFactsAndDecideInternal`):**

```
input: { clerkId, sourceMemoryId, capturedPrompt, source, profileId }

1. Get OPENROUTER_API_KEY (silent skip if absent — non-blocking)
2. STAGE A — fact extraction LLM call:
   - System prompt: derived from mem0 ADDITIVE_EXTRACTION_PROMPT (lines 468-943),
     trimmed for our scope (single prompt, no conversation history).
   - User prompt: { capturedPrompt, observationDate, currentDate }
   - Output: { facts: [{ id: 0, text, attributedTo: "user"|"assistant", linkedMemoryIds: [] }] }
3. For each extracted fact:
   a. Embed fact text (existing embeddingService.generateEmbedding).
   b. Call existing service.retrieveMemories(...) with fact text as query — top 10.
   c. STAGE B — decision LLM call:
      - System prompt: mem0 DEFAULT_UPDATE_MEMORY_PROMPT (lines 176-324) verbatim.
      - User prompt: existing memories (top-10 with their UUIDs), retrieved fact.
      - Output: { event: "ADD"|"UPDATE"|"DELETE"|"NONE", id?, text?, old_memory? }
   d. Apply:
      - ADD  → call createMemoryInternal with externalId = sha256(capturedPromptId + factIndex) + sourceType "v2-extracted"
      - UPDATE → service.createProposedUpdate(memoryId, proposedContent, reason)
      - DELETE → service.createProposedDelete(memoryId, reason)  [new method]
      - NONE → log + skip
4. Push memoryEvents per applied action.
```

**Steps:**

1. **`v2Prompt.ts`** — exports:
   - `buildFactExtractionPrompt(capturedPrompt: string, observationDate: string, currentDate: string): string`
   - `parseFactExtractionResponse(raw: string): { facts: Fact[] } | null`
   - `buildUpdateDecisionPrompt(fact: string, candidates: { id, text }[]): string`
   - `parseUpdateDecisionResponse(raw: string): { event: "ADD"|"UPDATE"|"DELETE"|"NONE"; id?: string; text?: string; old_memory?: string } | null`
   - All parsers tolerate `<think>` tags (Qwen models emit them — same pattern as `enrichmentPrompt.ts:extractJsonString`).
2. **`memoryService.ts`** — add `createProposedDelete(memoryId, userId, reason)`:
   - Cypher mirrors `createProposedUpdate` (already at lines 1400-1440); store kind: "delete" or use a separate `:ProposedDeletion` node. **Recommend extending `:ProposedUpdate` with a `kind` property** (default "update", new value "delete") to avoid duplicating CRUD/listing/resolve logic. Default kind="update" for backwards compatibility.
3. **`proposedUpdateApi.ts`** — already at the right level. Confirm `listProposedUpdates` returns the new `kind` field. Update `resolveProposalInternal` to handle `kind: "delete"` (on approve, hard-delete the memory; on reject, mark proposal rejected).
4. **`factExtraction.ts`** — implements the pipeline above. Schedule via `ctx.scheduler.runAfter(0, ...)` from `createMemoryInternal` — **only when `source === "prompt-capture"`** (don't run on every save).
5. **Schedule call** in `convex/neo4jActions/memories.ts:195` — alongside the existing enrichment scheduler:
   ```ts
   if (args.source === "prompt-capture") {
     await ctx.scheduler.runAfter(
       0,
       internal.neo4jActions.factExtraction.extractFactsAndDecideInternal,
       {
         clerkId: args.clerkId,
         sourceMemoryId: result.id,
         capturedPrompt: args.content,
         profileId: resolvedProfileId,
       },
     );
   }
   ```
6. **Web — proposals route** `apps/web/src/routes/_main/proposals.tsx`:
   - Lists pending proposals via `useQuery(api.proposedUpdateApi.listProposedUpdates)`.
   - Each card: target memory title (clickable to detail view), proposed change, reason, ApproveBtn / RejectBtn → `useMutation(api.proposedUpdateApi.resolveProposal)`.
   - For UPDATE proposals: show diff (old content vs proposed content).
   - For DELETE proposals: show "delete this memory?" with full memory content + reason.
   - Empty state.
7. **Sidebar** — `apps/web/src/components/sidebar/...`: add Proposals nav link with badge showing pending count (query existing `listProposedUpdates`, count where status="pending").
8. **NotificationContext** — when a new proposal is created, push a Convex `notifications` row so the existing notification badge surfaces it (use existing `notifications` table at `schema.ts:119-133`). Avoid duplicating notification UX.

**Cost / latency note:** two LLM calls per captured fact, plus N facts per prompt. For typical prompts (1-3 facts) that's 2-4 LLM calls. Async, so user never waits. Skips silently if no `OPENROUTER_API_KEY`.

---

## Item 10 — MCP `context_prompt` resource

**Goal:** Expose a synthesized "User Profile" as an MCP Resource so AI clients (Claude, Cursor) can read it once at conversation start without making N tool calls. Includes `aboutMe` + `preferences` from `userSettings`, top-N pinned memories verbatim, and an LLM-generated short prose summary of recent active memories. Cached in Convex; regenerated on memory write (debounced).

**Files:**

- `apps/mcp/src/resources.ts` — **new** file (currently zero resources registered)
- `apps/mcp/src/index.ts` — register resources alongside existing tool registration
- `apps/mcp/src/api-client.ts` — add `getContextPrompt(token)` helper
- `packages/backend/convex/contextPrompt.ts` — **new** file
- `packages/backend/convex/schema.ts` — add `contextPromptCache` table
- `packages/backend/convex/neo4jActions/memories.ts` — invalidate cache on writes (debounced)

**Steps:**

1. **Schema** in `schema.ts`:
   ```ts
   contextPromptCache: defineTable({
     userId: v.string(), // clerkId
     content: v.string(), // the synthesized prompt
     generatedAt: v.number(),
     memoryCountAtGeneration: v.number(),
   }).index("by_user", ["userId"]);
   ```
2. **`contextPrompt.ts`** in `packages/backend/convex/`:
   - Internal action `regenerateContextPromptInternal({ clerkId })`:
     - Reads `userSettings` (existing table) for `aboutMe`, `preferences`.
     - Queries Neo4j for pinned memories (`:Memory {status: "pinned"}`) — top 20 by recency.
     - Queries Neo4j for top 50 active memories by recency.
     - LLM call (OpenRouter, same model as enrichment) with prompt: "You are summarizing this user's memory state into a 200-word profile prose paragraph. Do not invent. Return plain text only."
     - Concatenates: `## About\n${aboutMe}\n## Preferences\n${preferences}\n## Pinned Memories\n${pinnedFormatted}\n## Profile Summary\n${llmProse}`.
     - Upserts into `contextPromptCache` for that userId.
   - Public auth action `getContextPrompt()`:
     - Read cache. If exists and `generatedAt` < 1 day old, return immediately.
     - Else schedule regeneration AND return current cache (or empty placeholder if first time).
3. **Cache invalidation** — in `createMemoryInternal` (and update/delete paths), schedule `regenerateContextPromptInternal` with **debounce**:
   - Add a `pendingRegeneration` flag on `contextPromptCache`. When invalidating, set `pendingRegeneration = true` and `scheduler.runAfter(60_000, regenerateIfPending)`.
   - The regeneration handler checks `pendingRegeneration`; if true, does the work and clears the flag. Subsequent invalidations within the 60s window flip the flag but the already-scheduled job will pick them up.
4. **MCP resources** `apps/mcp/src/resources.ts`:
   ```ts
   server.registerResource(
     "context_prompt",
     "vmem://context_prompt",
     { title: "User Profile", mimeType: "text/markdown" },
     async () => {
       const content = await getContextPrompt(token);
       return {
         contents: [
           {
             uri: "vmem://context_prompt",
             text: content,
             mimeType: "text/markdown",
           },
         ],
       };
     },
   );
   ```
5. **MCP `index.ts`** — call resource registration after tool registration (line ~140 area where tools register today).
6. **`api-client.ts`** in MCP — add `getContextPrompt(token)` calling `api.contextPrompt.getContextPrompt`.
7. **Note:** `recall` already exists as the `memory_retrieve` tool. **Don't add a new tool** — confirmed via exploration. Clean up: in the plan summary, remove the misleading earlier framing of "add `recall` tool" from item 10 — that work is already done.

---

## Verification

End-to-end manual test plan, run after each item.

### Item 3 (prompt rewrite)

- Save 3 representative memories (a Ferrari article, a startup-founder bio, a typescript blog post) via the extension.
- Inspect `:Memory` nodes in Neo4j: verify tags include specific names (e.g. "ferrari-488-gtb", not "sports-cars"); verify entities have canonical names.

### Item 4 (externalId)

- POST to `api.memoryApi.createMemory` with `externalId: "test-1", sourceType: "manual-test"` twice — second call must return the same memoryId (no duplicate row).
- Verify Neo4j Memory node has `sourceType` and `sourceId` properties set.
- Confirm unrelated saves (no externalId) still go through hash/URL/semantic dedup.

### Item 1 (Readability)

- Test on (a) Wikipedia article (long prose), (b) NY Times article (paywall + nav heavy), (c) GitHub issue, (d) ChatGPT conversation. Saved memory content should be the article body without nav/footer/sidebar noise.
- Test fallback: navigate to a near-empty page (e.g. `about:blank` if possible, or a stub page) and confirm strip-list path runs and saves something.
- Console check: no Readability errors thrown during normal use.
- Build the extension (`pnpm --filter chrome-extension build`) and verify `dist/content-readability.js` is produced.

### Item 7 (chunking)

- Save a 50 KB memory (paste a long article in `AddMemoryForm`).
- Verify in Neo4j: `MATCH (m:Memory {id: $id})-[:HAS_CHUNK]->(c:Chunk) RETURN count(c)` returns N>10.
- Run hybrid search via MCP `memory_retrieve` tool with a query that matches text in the middle of the memory. Verify result has `matchedChunk.content` populated and `matchedChunk.position > 0`.
- Save a 1 KB memory — verify NO chunks are created.
- Delete the memory — verify chunks are gone (`MATCH (c:Chunk {memoryId: $id}) RETURN c` empty).
- Run backfill action on a user with pre-existing long memories — verify chunks appear.

### Item 11 (file upload)

- Web dashboard: `AddMemoryForm` → upload a 5-page PDF → confirm memory created with extracted text; in Neo4j the Memory has `storageId`, `mimeType`, `originalFilename`.
- Upload same file twice → second attempt returns existing memory (externalId = content hash).
- Upload a .md file → memory content is the file's markdown.
- Upload a .pdf >25 MB → friendly error.
- Upload a 100-page PDF → memory created + chunks generated (item 7 integration).

### Item 2 (V2 ADD/UPDATE/DELETE/NONE)

- Extension on ChatGPT: type "I love Python" → submit → verify memory saved.
- Type "Actually I prefer Rust now" → submit → wait ~5s for async pipeline → check `/proposals` dashboard route → verify a pending UPDATE proposal exists targeting the previous memory with sensible diff.
- Approve the proposal → verify memory content updated in Neo4j.
- Type a multi-fact prompt: "I'm building vmem, my stack is Convex and Neo4j, my favorite editor is Helix" → verify three separate memories or proposals created.
- Test with no `OPENROUTER_API_KEY` — verify save still works, no errors, just no V2 pipeline (current enrichment pattern).

### Item 10 (context_prompt)

- Connect MCP server in Claude Desktop or via a test client.
- Read resource `vmem://context_prompt` — verify markdown returned with all four sections (About / Preferences / Pinned Memories / Profile Summary).
- Save a new memory → wait 60s+ → re-read resource → verify content updated (or `generatedAt` is fresh).
- Disconnect/reconnect within 1 day → verify cached version returned instantly without LLM call.

### Cross-cutting

- `cd packages/backend && npx convex codegen --typecheck enable` — must pass clean (per CLAUDE.md typecheck rule).
- No `any` / `unknown` / `as` introduced in any new code.
- All new server functions accept and propagate `profileId` correctly.
- `pnpm --filter web build` and `pnpm --filter chrome-extension build` both succeed.

---

## Dependencies summary (npm)

To add:

- `pdf-parse` → `packages/backend/package.json` (item 11)

Already present (verified):

- `@mozilla/readability` 0.5.0 → `apps/chrome-extension/package.json` (item 1)
- `turndown` → `apps/chrome-extension/package.json` (existing)

No new deps for items 2, 3, 4, 7, 10.

---

## Out of scope (deferred — discussed but not in this plan)

- Twitter bookmarks importer (item 5 from earlier list)
- Document status state machine (item 6)
- `attributed_to` on prompt-capture (item 8 — partly subsumed by item 2's two-stage pipeline)
- Selection-popup tweet detection (item 9)
- Web crawler connector (item 12)
- DOCX / XLSX / CSV / image parsers (item 11 extensions)
- Dashboard "view original file" preview UI (item 11 polish — `storageId` field makes this trivial later)
- Per-page Readability toggle (item 1 UX polish)

---

## Critical files to modify (quick index)

| Item | Files                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3    | `packages/backend/src/enrichmentPrompt.ts`                                                                                                                                                                                                                              |
| 4    | `packages/backend/convex/memoryApi.ts`, `convex/neo4jActions/memories.ts`, `src/neo4j/memoryService.ts`                                                                                                                                                                 |
| 1    | `apps/chrome-extension/src/lib/page-extraction.ts`, `src/content/readability/index.ts` (new), `manifest.json`, `vite.config.ts`, `src/background/context-menu.ts`, `src/popup/_components/QuickSave.tsx`, `src/background/index.ts`                                     |
| 7    | `packages/backend/src/neo4j/setup.ts`, `src/neo4j/memoryService.ts`, `src/neo4j/chunking.ts` (new), `convex/neo4jActions/memories.ts`, `convex/memoryApi.ts`                                                                                                            |
| 11   | `apps/web/src/components/AddMemoryForm.tsx`, `AddMemoryModal.tsx`, `contexts/MemoryContext.tsx`, `packages/backend/convex/memoryApi.ts`, `convex/fileImport.ts` (new), `src/parsers/pdf.ts` (new), `src/parsers/text.ts` (new), `package.json`                          |
| 2    | `packages/backend/src/v2Prompt.ts` (new), `convex/neo4jActions/factExtraction.ts` (new), `convex/neo4jActions/memories.ts`, `src/neo4j/memoryService.ts`, `apps/web/src/routes/_main/proposals.tsx` (new), `components/ProposalsList.tsx` (new), `components/sidebar/*` |
| 10   | `apps/mcp/src/resources.ts` (new), `src/index.ts`, `src/api-client.ts`, `packages/backend/convex/contextPrompt.ts` (new), `convex/schema.ts`, `convex/neo4jActions/memories.ts`                                                                                         |

---

## Reusable existing infrastructure (DO NOT rebuild)

- **3-layer dedup pipeline** (`createMemoryInternal`) — extend to Layer 0 only.
- **`upsertFromSource` MERGE pattern** — already does what item 4 needs for connectors.
- **`ProposedUpdate` Neo4j node + Cypher CRUD + Convex API** (`memoryService.ts:1400-1525`, `convex/proposedUpdateApi.ts`) — fully built; only needs UI + extension to `kind: "delete"`.
- **Hybrid retrieval** (`retrieveMemoriesInternal` BM25+vector+RRF+recency+confidence) — used by item 2 candidate retrieval and extended by item 7 for chunks.
- **`memoryEvents` audit log** — reuse for proposal events (already logs `proposal_approved`/`proposal_rejected`).
- **Composite index `memory_source_id` on (userId, sourceType, sourceId)** (`setup.ts:45-48`) — supports item 4 with no new index needed.
- **Vector index `memory_embedding` (1536, cosine)** + fulltext index `memory_content` — patterns for item 7's parallel chunk indexes.
- **`extractJsonString` `<think>` tag stripper** (`enrichmentPrompt.ts:68`) — reuse for item 2's V2 prompt parsers (Qwen3 emits think blocks).
- **`generateEmbedding`** (`embeddingService.ts`) — extend to batch for item 7.
- **`tryUserEnvVarByClerkId`** (`convex/lib/envVars.ts`) — reuse for OPENROUTER_API_KEY in items 2 and 10.
- **`scheduler.runAfter` async pattern** (`createMemoryInternal:195`) — reuse for items 2, 7, 10 background work.
- **Notification table** (`schema.ts:119-133`) — reuse for item 2 proposal notifications.
- **`userSettings` table** with `aboutMe`/`preferences` — feeds item 10.
- **MCP auth + Convex client setup** (`apps/mcp/src/auth.ts`, `api-client.ts`) — extend for item 10, no new auth.
