# AI guidance changelog

## 2026-04-14

- Chat (web, voice, mobile): retrieve memories via Convex `retrieveMemories` before streaming; show memory title badges under assistant messages; persist refs in `chatMessageMemoryRefs` for reload/history.
- Web settings: `/settings/import` — ChatGPT/Claude export upload, conversation picker, `memoryApi.createMemory` to Neo4j (`fflate` for ZIP).
