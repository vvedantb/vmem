# AI guidance changelog

## 2026-04-14

- Chat (web, voice, mobile): retrieve memories via Convex `retrieveMemories` before streaming; show memory title badges under assistant messages; persist refs in `chatMessageMemoryRefs` for reload/history.
- Web settings: `/settings/import` — ChatGPT/Claude export upload, conversation picker, `memoryApi.createMemory` to Neo4j (`fflate` for ZIP).
- Web responsive: sidebar memory stats refetch only when auth state changes (not on every route navigation); Clerk `UserButton` popover uses higher z-index so Sign out is clickable above the mobile drawer.
- Web: `/settings/preferences` and local model rows use a flat layout (section spacing + row dividers, no bordered cards); chat local-model dropdown shows names only (parameter counts stay in names; download size column removed).
- Mobile: Settings offline models list is flat (dividers, no per-model cards or size badges).
