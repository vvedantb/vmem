# AI guidance changelog

## 2026-05-22 (docs overhaul)

- Rewrote `apps/docs` from stale Hono REST (`localhost:3000/v1`) docs to match current Convex + Neo4j architecture. Added 21 new pages: architecture, environment, profiles, enrichment, 10 feature guides (chat/voice, extension, mobile, import, teams, skills, codebases, wiki/files, connectors, API keys), 5 new API reference modules, MCP setup + tools reference. Updated all existing pages (introduction, quickstart, concepts, API, MCP).

## 2026-04-15 (deferred enrichment queue)

- Convex `pendingMemoryEnrichment` + `pendingEnrichment` API: enqueue when MCP creates a memory, when import passes `queueForLocalEnrichment`, or when the web app creates a memory without a ready local model; drain on web (`useEnrichmentQueueDrain` / `PendingEnrichmentRunner`) and extension background (`pending-enrichment-drain.ts`) with the same Neo4j fetch → local LLM → `applyEnrichment` flow, max 50 per pass. Sidebar shows pending count above memory stats; sonner toasts on web drain batches.

## 2026-04-14 (enrichment)

- Removed OpenRouter/server-side `enrichMemory`; enrichment is local-only (web: `MemoryContext` + `runLocalFullEnrichment`; extension: Chrome AI or offscreen WebLLM). Convex exposes `listRecentMemoryTitlesForEnrichment` and `applyEnrichment` (optional `relatedMemoryIds`). Shared `buildFullEnrichmentPrompt` / `parseFullEnrichmentResponse` in `@vmem/backend/enrichmentPrompt`.

## 2026-04-14

- Chat (web, voice, mobile): retrieve memories via Convex `retrieveMemories` before streaming; show memory title badges under assistant messages; persist refs in `chatMessageMemoryRefs` for reload/history.
- Web settings: `/settings/import` — ChatGPT/Claude export upload, conversation picker, `memoryApi.createMemory` to Neo4j (`fflate` for ZIP).
- Web responsive: sidebar memory stats refetch only when auth state changes (not on every route navigation); Clerk `UserButton` popover uses higher z-index so Sign out is clickable above the mobile drawer.
- Web: `/settings/preferences` and local model rows use a flat layout (section spacing + row dividers, no bordered cards); chat local-model dropdown shows names only (parameter counts stay in names; download size column removed).
- Mobile: Settings offline models list is flat (dividers, no per-model cards or size badges).
