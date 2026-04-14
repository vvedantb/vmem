# vmem — project structure

Monorepo: Next.js web app (`apps/web`), Expo mobile (`apps/mobile`), Convex backend (`packages/backend`), MCP server (`apps/mcp`), shared UI (`packages/ui`).

**Chat + memories:** Local WebLLM chat (`/chat`, `useLocalChat`) and voice (`/voice`) call Convex `memoryApi.retrieveMemories` before each turn to inject Neo4j-ranked memories into the system prompt. Assistant message keys `${threadId}-${order}-${stepOrder}` align persisted memory reference badges via `chatMessageMemoryRefs` and `getThreadMessageMemoryRefs`. Shared prompt helpers live in `packages/backend/src/memoryRagPrompt.ts` (export `@vmem/backend/memoryRagPrompt`). Memory enrichment (semantic tags + related-memory links) runs only on the client: `listRecentMemoryTitlesForEnrichment` + local LLM + `applyEnrichment`; shared prompt/parse in `packages/backend/src/enrichmentPrompt.ts` (`@vmem/backend/enrichmentPrompt`).

**Import:** Settings → Import (`/settings/import`) parses ChatGPT or Claude official exports (ZIP/JSON) client-side and creates Neo4j memories via `memoryApi.createMemory` (episodic, tagged `import` + provider); no chat thread replay.
