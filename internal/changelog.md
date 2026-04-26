# Changelog

## Activity Route Semantics — Passive Logs (AI + Events) vs. Inbox (Attention) — 2026-04-27

- **Separated Activity from Inbox**: Moved Activity tab out of Inbox (which was semantically mixed: Proposals + Notifications = "needs attention" vs. Activity = "stuff that happened"). Activity is now its own page at `/activity`.
- **`/activity` unifies AI Logs + Events tabs**: Merged the AI Logs dashboard (platform-side LLM/embedding calls) with the user-action audit log (Events) under a single "passive log" concept. Both tabs are observation-only — no user action required.
- **Inbox simplified to Proposals + Notifications**: Inbox now clearly means "stuff awaiting your review/action" (synthesis proposals to approve, unread notifications). Activity badge removed; Inbox badge remains as proposalsCount + unreadCount.
- **Page titles hidden on desktop tabs**: Activity, Inbox, and API pages now use `showTitle={false}` since the tab bar in the header already communicates page identity. Mobile topbar still shows title via PageTitleContext for navigation clarity.
- **Event filter params namespaced to avoid collisions**: Events and AI Logs both use `range` and `sortDir` with different value enums. Events params are prefixed (`eventRange`, `eventSortDir`, `eventTypes`) so stale URL state doesn't leak between tabs.
- **Sidebar updated**: Account group now shows "Activity" (IconActivity) instead of "AI Logs" (reflecting the merged scope), pointing to `/activity`.
- **Legacy redirects**: `/ai-logs` → `/activity?tab=ai-logs`; `/openrouter-logs` → `/activity?tab=ai-logs` (direct, skipping chain); `/activity` (old standalone) conceptually merged into Inbox then split back out to Activity.

## Sidebar & Route Restructure — Reduce Clutter, Group Settings — 2026-04-26

- **Sidebar consolidation**: Reduced 13 main items → 11 by merging Proposals + Notifications + Activity into single "Inbox" entry (Account group now: AI Logs / Inbox / Settings). Inbox badge sums pending proposals + unread notifications.
- **Grouped settings sub-nav**: Replaced flat 11-item settings slide-out with 3 sub-sections (General: Preferences/Profiles/Models/Data Controls; Developer: API/Env Vars/Playground; Integrations: Connectors/Extension/Import). Settings nav now renders group headers and items in SidebarNavigation, mirroring MainNav pattern.
- **Route merge: `/inbox` (Proposals + Notifications + Activity)**: New `/inbox` with 3 tabs (default: Proposals). Old routes redirect: `/proposals` → `/inbox?tab=proposals`, `/notifications` → `/inbox?tab=notifications`, `/activity` → `/inbox?tab=activity`. Tab switcher and right-section actions (Run Dream Mode on Proposals, Mark All Read on Notifications, date/type filters on Activity) live in orchestrator.
- **Route merge: `/settings/api` (API Keys + Usage)**: New `/settings/api` with 2 tabs (default: Keys). Old routes redirect: `/settings/api-keys` → `/settings/api?tab=keys`, `/settings/usage` → `/settings/api?tab=usage`. Modal state (Create Key) lifted to orchestrator; "New Key" button only shown on Keys tab.
- **Rename: `/openrouter-logs` → `/ai-logs`**: Renamed route path + page title to "AI Logs" (new folder `ai-logs/`, old route redirects). Kept semantically separate from `/settings/usage` — AI Logs is platform-side synthesis calls; API Usage is third-party key requests.
- **Memories shared tab bar**: New `MemoriesTabs` component renders Graph | List | Tags tabs. Tags is a link to `/memories/tags` route (now discoverable). Both `/memories` and `/memories/tags` pages render the tab bar in page header.
- **Updated quick-access references**: Dashboard quick-links + CommandPalette settings now point to merged routes (`/settings/api`, `/inbox?tab=...`). Updated docstrings in button/panel components to reflect new page homes.

## Codebase Graph — Edges Render, Cypher/Payload Fixes — 2026-04-26

- **Fixed Cypher variable mismatch**: Renamed `rel.X` → `r.X` in two snippet constants (`CALLS_TIER`, `CALLS_CONF`) so they match the relationship binding name in all consuming `MATCH (a)-[r:TYPE]->(b)` patterns. This unblocked the graph payload from reaching the canvas.
- **Capped payload size with intelligent truncation**: Big monorepos overflow Convex's 8192 array limit on `CALLS` edges alone. Implemented `capNodes()` helper that keeps structural symbols (files, classes, interfaces, processes) and drops excess functions first, plus reordered edge queries so cheap structural types are fetched before expensive behavioral types. Both nodes and edges now respect the cap, and a `truncated` flag rides the response so users know to narrow down via filters.
- **Extended renderer to paint codebase edge types**: The canvas renderer only drew memory edge types (`tag`, `relates_to`, `wiki_parent`, `mentions`), leaving codebase types (`calls`, `imports`, `contains`, `has_method`, `extends`, `implements`, `starts_process`, `includes`) invisible. Now codebase edges piggyback on existing palette slots (warm for behavioral, cool for structural, teal for process membership) in both non-hover and hover render paths, eliminating the need for new theme entries.
- **Added edge hover tooltips for codebase graph**: Wired `onHoverEdge` callback to `<GraphCanvas>` and rendered `<GraphEdgeTooltip>` overlay, achieving parity with memory graph's edge label affordance. Node tooltips take priority and both suppress when the detail panel is open.
- **Truncation warning banner**: Top-center overlay (bg-warning/10) alerts users when the graph is sliced, encouraging them to apply filters (kinds, process, blast radius) to see the full topology.

## Custom SVG Animations & Branded Loading States — 2026-04-26

- **VmemDrawInIcon**: One-shot stroke draw-in animation for sidebar vmem logo (both desktop and mobile). Imports shared `VmemPaths` component and `vmem-anim.css` for animation orchestration.
- **VmemSpinner**: Petal sequencer animation (3-petal rotating sequence) for page-level full-page loading states (10 locations: Chat thread init, Dashboard, MemoryGraph, MemorySearch, CodebaseGraph, FilesClient, ApiKeysLoadingSkeleton, ApiLogsLoadingSkeleton, HistoryTab, codebases/$id). Not used for button-level actions — those stay as IconLoader2 spinners for appropriate affordance.
- **VmemThinkingLoader**: Stroke trace loop animation for chat thinking/reasoning indicator (component created, integration pending).
- **Centralized animation infrastructure**: Moved shared path data (`VmemPaths`), keyframe animations (`vmem-anim.css`), and size normalization logic (`pathLength="100"`) to `apps/web/src/components/svg-animations/` folder. All three animated components import from there, reducing duplication.
- **Sidebar logo migration**: Updated `Sidebar.tsx` to use `VmemDrawInIcon` instead of dual static image imports (light/dark), leveraging `currentColor` for theme-aware SVG fills.
- **Clarified VmemSpinner scope**: Applied only to page-level loading (full-page spinners, skeleton states), not button-level micro-interactions, after user feedback on affordance appropriateness.

## Clear Chat History — 2026-04-26

- **`clearChatHistory` authMutation**: Verifies thread ownership via the agent SDK's `getThreadMetadata`, drops every `chatMessageMemoryRefs` sidecar row scoped to `(userId, threadId)`, then kicks off the agent component's `deleteAllForThreadIdAsync` cascade (paginated tail-call delete that handles arbitrarily large threads). Returns a freshly-created thread id in the same round-trip so the UI swaps atomically with no "no thread" gap.
- **`useLocalChat` exposes `clearHistory()` + `isClearing`**: Hook now owns the thread swap. Bails if a stream is mid-flight so we never delete a thread we're actively writing to. The existing threadId-change effect handles draft state reset; usage drafts are explicitly cleared to cover pending-summary edge cases.
- **Trash button + confirmation dialog in `Chat.tsx`**: Right-aligned "Clear chat" affordance only appears when `messages.length > 0` so the empty state stays quiet. Click opens a destructive-styled `Dialog` with `IconAlertTriangle`, explicit "cannot be undone" copy, and a loading state during deletion. Toast feedback on success/error.

## Dream Mode V2 — Synthesis Materialization & Enrichment Fixes — 2026-04-26

- **Materialized synthesis memories now fully enriched**: Previously, accepting an insight/connection proposal created a bare memory with only `:DERIVED_FROM` edges and no embedding, tags, entities, or `:RELATES_TO` links — useless in graph view. Now synthesis materialize runs through the same enrichment pipeline as regular memory creates, gaining full graph context.
- **Anomaly reclassified as dismiss-only flag**: Anomalies were materializing as memories with meta-content ("memory about a memory") because by definition an anomaly is a flag ("confirm this belongs"), not new knowledge. Now anomalies and contradictions both clear the proposal on approve/reject with "Acknowledge"/"Dismiss" buttons — the user reviews the anomaly seed memory itself, not a re-wrapped summary.
- **Strict synthesis prompt with meta-language rules**: Updated Dream Mode prompt with hard rules banning "outlier", "unlike others", "the memory about X" phrasing and added bad/good example pairs (e.g., bad: "Cloudflare note is outlier vs generic X", good: "I gravitate toward edge-compute platforms — Cloudflare Workers..."). Reason field kept as metadata reference so users see which sources drove the synthesis.
- **Auto-accept now insight/connection only**: The auto-accept toggle applies only to materializable kinds (insight, connection). Contradictions and anomalies always route through proposals for human review, even with auto-accept enabled.
- **Post-materialize enrichment scheduling**: Both auto-accept path (`dreamMode.ts`) and manual approve path (`proposedUpdates.ts`) schedule `enrichMemoryInternal` after materialization so tags, entities, and `:RELATES_TO` edges populate asynchronously.

## OpenRouter Call Logging & Cost Dashboard — 2026-04-26

- **Centralized OpenRouter wrapper (`convex/lib/openRouter.ts`)**: Single source of truth for chat completions and embeddings. Injects `usage:{include:true}` for inline cost, measures latency, schedules log rows for every HTTP attempt (including retries/errors), gates prompt/completion preview text on `OPENROUTER_LOG_PROMPTS=1` env var.
- **Comprehensive logging schema**: `openRouterLogs` table captures endpoint, model, status, error class, tokens (prompt/completion/cached/reasoning), cost USD, latency ms, finish reason, and optional generation ID for OpenRouter lookup. Denormalises `teamId` from `profileId` at write-time so team-wide spend queries hit a single index without joins.
- **All 13 call-sites refactored to flow through the wrapper**: 5 chat sites (`enrichment`, `dream-synthesis`, `context-prompt`, `fact-extraction`, `entity-backfill`) + 8 embedding sites (`memory-save`, `memory-search`, `mcp-embed`, `connector-sync`, `dream-materialize`, `proposal-accept`, `embedding-backfill`) now stamp `userId`, `profileId` (string at boundary, normalised to `Id<"profiles">` at insert), and feature on every row. Retries are logged separately so a 429-storm is visible without dedup.
- **Per-workspace + team-wide spend attribution**: Every log row carries optional `profileId` (personal or workspace) and denormalised `teamId` (from profile at insert). Dashboard scope switcher (Personal / Team) controls which rows are visible; team members can see their team's aggregate spend without leaking individual prompts when preview opt-in is off.
- **`/openrouter-logs` dashboard route**: Lists paginated call logs (50/page) with Virtuoso virtualisation, 4 stat cards (today's cost / tokens / avg latency / success rate), unified filters dropdown (range, status, features, models, profile), sort dropdown (newest/oldest), and scope selector (Personal/Team-N). Click any row to open detail panel with all fields + truncated prompt/completion previews.
- **Sidebar entry under Account**: Added "OpenRouter Logs" badge with `IconReceipt2` icon (cost/billing metaphor) positioned between Activity and Proposals per spec.
- **Backend queries**: `listMine` (paginated, scope/profile/feature/model/status/range filters with auth fence on team membership), `summaryMine` (today/7d/30d aggregates, 5k scan cap marked `isApprox:true`), `distinctModelsMine` (drives Models filter dropdown).
- **Privacy default OFF**: `promptPreview` and `completionPreview` only populate when deploy sets `OPENROUTER_LOG_PROMPTS=1`. Without the flag, rows are logged but previews are absent from storage, so team members can't see prompts unless explicitly opted in.
- **Deleted obsolete `embeddingService.ts`**: All embedding calls now thread through the unified wrapper. `generateEmbedding[s]` signatures gained `ctx`, `userId`, `profileId?`, `feature` parameters so call-sites flow `profileId` through the embedding stack.

## Per-User Dream Mode Scheduling via Crons Component — 2026-04-26

- **Runtime cron registration with `@convex-dev/crons`**: Replaced static daily 4am UTC broadcast with per-profile dynamic crons. Each profile that has scheduling enabled gets its own cron registered at `dream-mode:<profileId>`, allowing O(1) lookup when toggling.
- **Per-profile schedule UI in settings**: Added `DreamModeSection` in the profile settings page with per-profile cards showing auto-accept toggle (unchanged) and a "Run daily at [HH:MM]" time picker + schedule toggle. UI converts user's local time to UTC before saving, stores on profile (`dreamModeScheduleEnabled`, `dreamModeScheduleHour`, `dreamModeScheduleMinute`).
- **Browser↔UTC time conversion**: JavaScript `Date` API handles local-to-UTC conversion on the client side, avoiding server-side timezone library. Tradeoff: DST shifts the user's perceived local time by 1h on transitions, but cron always fires at the same absolute UTC moment (acceptable for daily synthesis).
- **Delete-then-register pattern**: Since the crons component has no "update schedule" primitive, `setDreamSchedule` mutation deletes any existing cron and re-registers when saved. Name-based lookup (`dreamCrons.get(ctx, { name })`) enables efficient per-profile management.
- **Profile-aware scheduling**: New `runDreamForProfileById` internal action resolves the profile's `userId` → `clerkId` at fire time, then delegates to `runDreamForProfileInternal`. Stores only `{ profileId }` in cron args to avoid stale clerkId snapshots.

## Dream Mode V2 — Background Reasoning Engine — 2026-04-26

- **Surprisal-driven nightly synthesis**: Daily 4am UTC cron scans each profile's last 7 days of memories, scores them by k-NN cosine surprisal against existing embeddings, clusters the top anomalies via 1-hop graph neighborhoods (`RELATES_TO` + shared `MENTIONS`), and asks Qwen3-235B to label each cluster as an insight, connection, contradiction, or anomaly. Vmem now gets smarter about a user the longer it observes them — no explicit action required.
- **Synthesis routes through the existing proposals queue**: New `:ProposedUpdate` kinds (`insight | connection | contradiction | anomaly`) carry `sourceMemoryIds`, `proposedTitle`, `confidence`, and `source` so the user can review what was derived and from which source memories. Confidence floor 0.6 and 50% sourceMemoryIds-overlap dedup keep noise out of the inbox.
- **Auto-accept opt-in per profile**: New `dreamModeAutoAccept` toggle on the profile settings page lets trusted profiles materialize synthesis directly as `:Memory` nodes (`source='dream-mode'`, `:DERIVED_FROM` edges to every source) instead of going through the approval step. Toggle lives in a dedicated `DreamModeSection` matching the existing `DefaultProfilesSection` pattern.
- **Manual trigger button on `/proposals`**: `RunDreamModeButton` lets users kick off a run on demand against their default web profile. Rate-limited to 1/hr per profile via `lastDreamRunAt` with explicit toast feedback for `ok | no-key | no-recent-memories | rate-limited`.
- **`SynthesisProposalCard` UI**: New card variant renders type badge with kind-specific icon/color, source memory list (linked to the memory graph view focused on each source), confidence progress bar, and reason. Contradictions show "Acknowledge"/"Dismiss" since V1 is dismiss-only — TODO comment marks the structured-resolution V2 path.
- **Activity feed integration**: Synthesis events log with `actor='dream-mode'` and surface in the activity feed as a new `memory_dream_created` type with sparkles icon — distinguishing them from regular memory creates without a separate event table.
- **Dedup, soft-fail, and batch caps**: Cron processes 20 profiles per tick (self-rescheduling cursor mirrors the embedding backfill pattern), skips users without `OPENROUTER_API_KEY`, and dedups against pending proposals before creating new ones. Cost target: ~$0.05–$0.10/user/day at Qwen3-235B prices.

## Codebase Parser Phase 1 — Symbol Graph + Processes + Blast Radius — 2026-04-26

- **ts-morph AST parser replaces regex**: Codebase sync now extracts Functions, Classes, Interfaces, and call edges from a real TypeScript AST instead of regex-only imports. Per-edge confidence tiers (EXTRACTED 1.0 / INFERRED 0.7 / AMBIGUOUS 0.4) capture how the parser resolved each call — ready for Phase 2 hub/surprise scoring without a re-sync.
- **Stable qualified-name IDs**: Symbols use `<codebaseId>:<relPath>:<symbolPath>` (methods as `Class.method`) so re-syncs idempotently MERGE the same node, surviving renames don't, and raw Cypher stays debuggable.
- **Entry-point–rooted Processes**: Detector recognises Convex (`query`/`mutation`/`action`/`httpAction`/`auth*`), TanStack (`createFileRoute`), and heuristic top-level entry points (`main`, `handler`, `on*`, exported zero-incoming functions). BFS forward to depth 8 produces `:Process` nodes with `INCLUDES` edges — answers "what does this HTTP route touch end-to-end?".
- **Blast radius queries**: New `getImpact` action runs bounded variable-length Cypher (`<-[:CALLS*1..depth]-`) for upstream callers / downstream callees of any symbol. Frontend reuses the existing `searchMatchSet` highlight path — no new render code.
- **Multi-kind graph canvas**: Files (squares), functions (circles), classes (hexagons), interfaces (diamonds), processes (starbursts) render side-by-side with theme-aware palette entries and degree-based size scaling. Edge types extended to `calls` / `contains` / `extends` / `implements` / `starts_process`.
- **Consolidated nuqs filters per UI rules**: Single `Filters` dropdown with Kinds + Process picker + Directory sections, plus a separate Search popover. All filter state (`kinds`, `processId`, `blastRadiusOf`, `blastDirection`, `search`) lives in the URL via `useQueryStates` so deep-links and refreshes preserve the view. Active-count badge counts each non-default field as 1.
- **Symbol detail panel**: Selecting a node opens a slide-in panel (URL `?blastRadiusOf=…` doubles as the selection pointer) showing file/lines/exported/async/test metadata, Calls In, Calls Out, Process membership, and an upstream/downstream flip toggle for functions and classes.
- **AI memory consumer surface**: New `codebaseSymbols.{getOverview,getGraph,getContext,getImpact,searchSymbols}` Convex actions provide the queryable interface that `apps/mcp` will wrap — `vmem_codebase_search`, `vmem_codebase_context`, `vmem_codebase_impact` tools answer "what depends on X" against the graph.
- **PARSER_VERSION re-sync banner**: `/codebases` index detects rows whose `parserVersion` mismatches the bundled constant and surfaces an amber banner with a one-click `syncAllMy` action — bumping the version on a deploy automatically lights up the prompt without server-side migration.
- **Live `parseStage` feedback**: Sync action patches `parseStage` (`fetching` → `parsing` → `processes` → `writing` → `done`) and the detail-page status badge swaps to a friendly stage label mid-sync via the existing `useQuery` reactivity.
- **Header stat line**: Codebase detail page header shows `<files> · <fns> · <classes> · <processes>` from a live overview query, falling back to the persisted counts so navigation doesn't flash empty values.
- **Repo-size guard**: 3000-file hard cap surfaces as `lastParseError` instead of timing out the Convex action — chunked sync deferred to Phase 3.
- **Memory subgraph untouched**: All new labels are scoped by `(userId, codebaseId)`; existing `(:Memory)`, `(:Tag)`, `(:Entity)` graph stays separate, so memory and codebase queries don't cross-contaminate.

## Memory Extraction & Import Upgrades (mem0 + supermemory adoption) — 2026-04-26

- **Detail-preserving enrichment prompt**: Replaced the generic tag/entity extraction prompt with mem0-derived guidance (preserve specific names, no fabrication, no implicit attribute inference). Tags now keep proper nouns and specific tech ("ferrari-488-gtb" not "sports-cars"); entities use canonical full names.
- **Idempotent imports via `externalId`**: `createMemory` now accepts optional `externalId` + `sourceType`. Re-importing the same external resource returns the existing memory (Layer 0 dedup, ahead of URL/hash/semantic). Composite Neo4j index already in place — zero schema cost.
- **Mozilla Readability page extraction**: Chrome extension now uses `@mozilla/readability` in a bundled content script for main-article extraction on Wikipedia/NYT/article-style pages, with the original strip-list as a fallback for pages where Readability returns nothing. Bundle: ~60 KB injected once via manifest.
- **Chunk-level storage for long content**: Memories larger than 2 KB are sliced into ~500-token sliding-window chunks (50-token overlap, snapped to whitespace) and stored as `:Chunk` nodes with their own embedding + fulltext indexes. Retrieval gains a 4th leg (chunk vector search), and chunk hits decorate parent memories with a `matchedChunk` snippet — long PDFs and articles are now paragraph-addressable while whole-memory semantic dedup still works. Backfill action ships for existing long memories.
- **File upload: PDF / TXT / MD**: Web dashboard `AddMemoryForm` now accepts file uploads (≤25 MB) into Convex storage. Server-side text extraction via `pdf-parse`, content-hash-based dedup (re-uploads return the existing memory), and 100-page PDFs auto-chunk through the new chunking pipeline. Original blob is retained on `_storage` for future preview.
- **V2 ADD/UPDATE/DELETE/NONE pipeline for prompt captures**: Captured prompts from ChatGPT/Claude/T3 now run through a two-stage LLM pipeline (extract atomic facts → decide ADD/UPDATE/DELETE/NONE per fact against top-10 hybrid-retrieved candidates). ADDs become new memories; UPDATEs and DELETEs become **proposals** in the existing approval inbox — never silent overwrites. Runs async; degrades silently without `OPENROUTER_API_KEY`.
- **Proposals approval UI + sidebar badge**: New `/proposals` route surfaces pending update/delete proposals with diff for updates and full snapshot+reason for deletes. Sidebar nav shows a pending count badge alongside notifications. Reuses the existing `:ProposedUpdate` Neo4j infrastructure with a new `kind` field for delete proposals.
- **MCP `context_prompt` resource**: New `vmem://context_prompt` MCP Resource (markdown) lets AI clients (Claude Desktop, Cursor) read a synthesized user profile (about + preferences + pinned memories + LLM prose summary) once at conversation start instead of fanning out to N tool calls. Cached in Convex with 24h TTL; debounced (60s) regeneration on memory writes via a `pendingRegeneration` flag so bursts of writes trigger only one regen job.

## Content Deduplication Pipeline — 2026-04-26

- **4-layer dedup on memory creation**: Every memory create (API + MCP) now runs through URL match → title+domain match (browsing-history only) → MD5 content hash → semantic similarity (≥0.95 cosine). All layers increment `visitCount` on the existing memory instead of creating a duplicate.
- **Content hash (Mem0-style)**: MD5 of normalized `title+content` stored on every Memory node. Zero API cost, catches identical submissions. Composite index `(userId, contentHash)` for O(1) lookup.
- **Semantic near-duplicate detection**: When an embedding is available, vector index query catches near-duplicates that differ by trivial edits but hash differently. No competitor does this at ingestion time.
- **Title+domain dedup for browsing history**: Sites with a generic `<title>` across all routes (e.g. "vmem" on every page) no longer spawn N separate memories. Same title + same origin from browsing-history/bookmarks sources merge into one memory.
- **Backfill + cleanup migrations**: `startContentHashBackfill` stamps hashes on existing memories (pure CPU, batch 200). `deduplicateBrowsingHistory` merges same-title browsing-history memories per user, transferring tags/relationships/entities to the oldest survivor.
- **Competitor enrichment/dedup analysis doc**: `internal/docs/enrichment-dedup-comparison.md` — comparison of vmem vs Supermemory, Mem0, Honcho, Hermes, and IWE based on actual source code analysis (not docs/marketing).

## Graph Rendering & Interaction Improvements — 2026-04-26

- **Fixed viewport fit in React StrictMode**: Reset `hasFittedRef` flag when simulation restarts to ensure viewport re-fits on layout settle. Prevents the second render in StrictMode (dev) from keeping the old fitted state and missing the canvas reset.
- **Edge hover highlighting**: When hovering an edge, both endpoint nodes now highlight along with the edge, making it clear which nodes that edge connects. Matches behavior for hovering nodes and their neighbors.
- **Extracted golden spiral seeding**: Moved position initialization into `seedNodePositions` function used by both worker and main-thread simulations, ensuring consistency and reducing code duplication.
- **Proper TypeScript typing for worker messages**: Worker position messages now have explicit `WorkerPositionMessage` type, improving type safety and IDE intellisense.

## Memory Graph Popover Simplified — 2026-04-26

- **Popover shows title only**: Removed description/content from memory graph node popovers to reduce visual clutter. Hovering a node now displays just the title.
- **Removed content preload on hover**: Content is now fetched only when clicking to open the detail panel (not on hover), reducing unnecessary API calls while accepting a brief loading state in the detail panel.

## Graph Physics: Tag Edges Visual-Only — 2026-04-25

- **Excluded tag edges from D3 force simulation**: Tag edges (shared tag relationships) no longer participate in physics calculations. Only `relates_to`, `imports`, and `wiki_parent` edges pull nodes together, preventing artificial clustering from incidental tag matches.
- **Cleaner semantic-driven layouts**: Graph layout now clusters nodes based on meaningful relationships rather than surface-level tag overlap — memories that share a "work" tag no longer get pulled together unless semantically related.
- **Simplified link force strength**: Removed conditional strength branching (`0.3`/`0.12` vs `0.6`/`0.8`) since tag edges are excluded; all structural edges now use uniform `0.6` strength.

## Server-Side Enrichment Migration — 2026-04-25

- **Moved memory enrichment from local WebLLM to server-side OpenRouter**: Local Qwen3-0.6B was too small for reliable structured JSON output — tags were inconsistent, `<think>` tags broke parsing, and model downloads failed on poor connections. New `enrichMemoryInternal` Convex action calls Qwen3-235B-A22B via OpenRouter (~$0.00015/memory) with dramatically better quality.
- **Fire-and-forget enrichment via `ctx.scheduler.runAfter`**: Memory creation returns instantly; enrichment runs asynchronously in the background. Graceful degradation — if no OPENROUTER_API_KEY is set, enrichment is silently skipped.
- **Deleted entire local enrichment pipeline from Chrome extension**: Removed 8 files (offscreen document, WebLLM worker, enrichment router, pending drain, Chrome AI fallback), stripped offscreen permission, removed `@mlc-ai/web-llm` dependency, cleaned up settings UI and message types.
- **Deleted `pendingMemoryEnrichment` Convex table and queue system**: Server-side enrichment is fire-and-forget, so the client-side queue (enqueue → poll → drain → apply) is no longer needed. Removed table from schema, deleted `pendingEnrichment.ts`, removed public `listRecentMemoryTitlesForEnrichment` and `applyEnrichment` API endpoints.
- **Cleaned up all consumers across web app and MCP server**: Removed `PendingEnrichmentRunner`, `PendingEnrichmentBadge`, `useEnrichmentQueueDrain` hook, and enrichment-related imports from MemoryContext, SidebarFooter, ClientProvider, and MCP create action.
- **Web app local LLM (chat/voice) intentionally preserved**: WebLLM in the web app serves a different purpose (interactive chat without third-party LLMs) and was not affected by this migration.

## Entity Extraction + Graph-Augmented Retrieval — 2026-04-25

- **Named entity extraction during enrichment**: LLM enrichment now extracts people, organizations, places, and technologies from memories — zero additional API cost (piggybacks on existing enrichment call). Entities stored as hub nodes in Neo4j with `MENTIONS` edges.
- **Entity hub nodes on the graph canvas**: Entities render as gold 8-pointed starbursts that memories orbit around. Entity sizing scales with mention count. Filterable as a Kind in graph/list filters.
- **MENTIONS edges in all 7 view themes**: Teal-green edges connect memories to their entities across Default, Satellite, Constellation, Blueprint, and Minimal themes (dark + light variants).
- **Graph-augmented retrieval**: Retrieval now expands top-5 BM25/vector results through the knowledge graph (1-hop direct, 1-hop via entity hub, 2-hop RELATES_TO). Graph proximity contributes 10% of the final score — graph-only discoveries appear below strong text/semantic matches but above weak ones.
- **Entity backfill migration**: `startEntityBackfill` action processes existing memories in self-rescheduling batches of 20, extracting entities via LLM. Run once from Convex dashboard.
- **Full-stack entity threading**: Entities flow through enrichment prompt → parser → Convex actions → memoryService → graph API → frontend types → canvas renderer → chrome extension enrichment callers.

## Colorful Brand Icons for Connectors — 2026-04-25

- **Replaced monochrome Tabler icons with brand-colored SVGs**: Connector cards and browse modal now display logos with their official brand colors (Google Drive multicolor, OneDrive/Slack/Dropbox in brand blue, Linear in brand purple). GitHub and Notion remain monochrome per their official brands.
- **New `brand-icons/` component library**: Created dedicated SVG components for each connector (`GoogleDriveIcon`, `OneDriveIcon`, `DropboxIcon`, `NotionIcon`, `SlackIcon`, `GitHubIcon`, `LinearIcon`) with proper viewBox and fills, indexed in `index.ts` for reusability.
- **Updated icon map in ConnectorCard and BrowseConnectorsModal**: Both components now reference the colorful icons instead of Tabler's monochrome `IconBrand*` variants, improving visual identity and connector recognition on the settings page.

## Embedding Auto-Linking: Semantic Memory Connections — 2026-04-25

- **Automatic semantic edges**: New memories with embeddings now automatically link to up to 5 semantically similar existing memories (threshold ≥ 0.78 cosine similarity). Uses the existing Neo4j vector index; ~10–20ms added latency (negligible vs. embedding HTTP call).
- **Backfill migration for existing memories**: Added `startSemanticEdgesBackfill` action to create semantic edges for all memories saved before this feature. Self-rescheduling in batches of 50 — kick off once from Convex dashboard and it drains the queue automatically.
- **Similarity score in graph visualization**: Semantic edges display their cosine similarity score (0–1) as a percentage in the graph tooltip (e.g., "semantic similarity (84%)"). Edited `score` through Convex types + frontend types (zod schemas, canvas types, component props).
- **Covers connector imports too**: Semantic edges created for memories from connectors (Google Drive, Notion) and MCP sources when they have embeddings. Non-semantic relationships (same-domain, content-similarity) coexist.
- **Why Neo4j matters**: Flat vector stores (Mem0, Supermemory approach) can't do multi-hop traversal or cluster detection. Neo4j's graph structure enables future features: "find all memories related to this cluster," "show evidence chain for this conclusion," "detect entity networks."

## Chrome Extension Resilience & Enrichment Fixes — 2026-04-25

- **Safe messaging for content scripts**: All 6 `chrome.runtime.sendMessage` calls in content scripts now go through `safeSendMessage`, which guards against invalidated extension contexts (extension reload/update) instead of crashing with "Cannot read properties of undefined"
- **Qwen3 thinking-tag parsing**: Enrichment LLM response parser now strips `<think>...</think>` blocks that Qwen3 models emit, fixing all "Failed to parse LLM response" errors. Also handles unclosed think blocks from token-limit truncation
- **Enrichment prompt hardened**: Added explicit "no thinking, no markdown" instructions to both the prompt template and a system message, reducing wasted tokens on reasoning the model doesn't need to show
- **Better WebLLM error messages**: Network failures during model download now show "check your internet connection" instead of a raw `TypeError: Failed to fetch`

## AI Chat Integration UX Fixes — 2026-04-25

- **Keyboard shortcut changed to Alt+S**: Replaced non-working Ctrl+Shift+S with Alt+S, now shows an in-page toast confirming save success or failure via `chrome.scripting.executeScript`
- **Memory panel loading spinner**: Auto-search now shows a spinner with "Searching memories…" immediately when the search fires, replacing the 5-second blank wait before results appear
- **Memory panel footer hint**: Added "Hit send to include context" footer so users understand the workflow — memories are auto-injected on send, no manual selection needed
- **Source labels for prompt-capture and YouTube**: Added missing entries to `MEMORY_SOURCE_LABELS` so these sources display properly in the web dashboard filters

## AI Chat Integration & Onboarding — 2026-04-25

- **Auto-search memories in AI chats**: As users type in ChatGPT or Claude, vmem now automatically searches for relevant memories and displays them in a floating panel above the input. Memories are injected as context when the user sends their message. Turns vmem from "save and forget" into "save and automatically resurface."
- **Auto-capture prompts**: Optionally saves prompts sent to ChatGPT/Claude as memories (off by default). Builds memory passively with deduplication and minimum-length guards so trivial messages are skipped.
- **Memory panel with per-item removal**: Auto-search results appear in a Shadow DOM floating panel with individual remove buttons and "Clear all." Users control exactly which memories get injected before sending.
- **In-page toast notifications**: New Shadow DOM toast system for showing save confirmations, errors, and loading states directly on the page — works without the popup open (keyboard shortcut saves, auto-capture, etc.).
- **Welcome page on first install**: New onboarding page opens on extension install with feature highlights and getting-started instructions. Static HTML with dark mode support, no extra build target needed.
- **Settings toggles**: Added "Auto-search memories in chats" (on by default) and "Auto-capture prompts" (off by default) to the popup settings panel.
- **Removed unused `@anthropic-ai/sdk`**: Was installed but never imported anywhere. Cleaned up 247 packages from node_modules.

## Chrome Extension Extraction Enhancements — 2026-04-25

- **Full page markdown extraction**: Saved pages now preserve formatting (headings, lists, code blocks, links) via TurndownService HTML-to-Markdown conversion, instead of flat `innerText`. Strips nav, footer, ads, and other non-content elements before conversion.
- **OpenGraph metadata extraction**: Page saves now use `og:title` when available (usually cleaner than `document.title`), and extract `og:image` / `og:description` for richer memory cards in the future.
- **Keyboard shortcut (Ctrl+Shift+S)**: Quick-save the current page without opening the popup. Uses Chrome's commands API; Mac users get `Cmd+Shift+S`.
- **YouTube transcript extraction**: New content script injects a "Save to vmem" button on YouTube video pages. Extracts video title, channel name, and full transcript from YouTube's timedtext API. Saved with `source: "youtube"` tag for filtering.
- **Files affected**: `manifest.json`, `src/lib/page-extraction.ts` (new), `src/background/index.ts`, `src/background/context-menu.ts`, `src/background/message-handler.ts`, `src/types/messages.ts`, `src/popup/_components/QuickSave.tsx`, `src/content/youtube/index.ts` (new), `scripts/build.ts`
- **Reason**: Compared Mem0 and Supermemory browser extensions — both had richer extraction than vmem. Supermemory uses Turndown for markdown; Mem0's YouTube assistant extracts transcripts. Adopted the best of both: markdown for all pages, plus dedicated YouTube support for video content.

## Browser History Import Overhaul — 2026-04-25

- **Stop creating junk "same session" edges for batch imports**: Browsing history, bookmarks, and connector imports (Google Drive, Notion, etc.) no longer create O(n²) RELATES_TO edges. Only interactive sources (manual, voice, chat) create same-session relationships.
- **Visit count tracking instead of duplicates**: Revisiting the same URL now increments `visitCount`, `lastVisitAt` on the existing memory instead of silently skipping. Tracks browsing frequency without creating duplicates.
- **Same-domain relationship edges**: URL-based memories now connect to other memories from the same domain (limited to 10 edges). Creates useful clustering (all GitHub pages, all Stack Overflow pages) without session spam.
- **Extended URL normalization**: Added 20+ tracking parameters to strip (fbclid, gclid, msclkid, igshid, mkt_tok, \_ga, etc.). Reduces duplicate URLs from ad/social tracking.
- **Migration to delete existing junk edges**: Added `deleteJunkSessionEdges` internal action to clean up existing "same session" edges from batch sources. Run via Convex dashboard per user.
- **Referrer chain infrastructure**: Added visit map building for future referrer-based navigation edges (NAVIGATED_FROM relationships).
- **Files affected**: `packages/backend/src/neo4j/memoryService.ts`, `packages/backend/src/neo4j/url.ts`, `packages/backend/convex/neo4jActions/memories.ts`, `packages/backend/convex/neo4jActions/migration.ts`, `apps/chrome-extension/src/background/import-history.ts`
- **Reason**: Importing 500 browser history items created ~125,000 junk edges, making the graph unusable. The "same session" heuristic was designed for interactive use but applied to batch imports. New design: batch sources get domain-based clustering, interactive sources keep session proximity.

## Golden Spiral Graph Layout — 2026-04-25

- **Golden spiral initial positions**: Graph nodes now start in a sunflower-seed spiral pattern instead of random positions. Eliminates the chaotic bouncing on load where overlapping nodes push apart violently.
- **Applies to both worker and main-thread simulations**: The `goldenSpiralPosition()` helper computes deterministic positions using the golden angle (~137.5°), ensuring consistent layouts across page loads.
- **Files affected**: `apps/web/src/components/_components/canvas/simulation.ts`
- **Reason**: Random initial positions caused poor visual experience on graph load — nodes exploded outward from a clustered center. Golden spiral is the mathematically optimal packing pattern (used by sunflowers), giving force simulation a clean starting point to refine.

## Version Chain UI — Memory History Timeline — 2026-04-25

- **Explicit versioning for memory edit history**: History tab now displays memories as numbered versions (v1, v2, v3...) instead of a flat event timeline, making it clear how a memory evolved over time. Users click any version dot to jump to that version, and arrow buttons step through sequentially.
- **Visual version navigator**: Compact dot navigator shows all versions at a glance, with filled/empty dots indicating presence of snapshots. Current version highlighted, metadata shows "v3 of 5 · Created Mar 12 · Last: 2h ago".
- **Change summary per version**: Each version card displays inline stats ("+42 chars, -10 chars, +productivity tag, -work tag") so users can scan what changed without opening the diff. Title changes shown as strikethrough → new title.
- **Diff preview on selection**: Clicking a version card expands to show the full diff from the previous version (colored additions/deletions). Non-selected cards stay compact for fast browsing.
- **Files affected**: `apps/web/src/lib/timeline.ts`, `apps/web/src/hooks/useVersionChain.ts` (new), `apps/web/src/components/_components/VersionChainBar.tsx` (new), `apps/web/src/components/_components/VersionCard.tsx` (new), `apps/web/src/components/_components/HistoryTab.tsx`
- **Reason**: Memory audits currently show a flat chronological timeline of events, making it hard to see what changed at each step or compare versions. Explicit versioning with change summaries is a higher-fidelity UX for memory lifecycle transparency — a vmem core differentiator vs Mem0/Supermemory, which either silent-overwrite or lack version history altogether.

## Memory Vector Search — Hybrid Retrieval via RRF — 2026-04-24

- **Semantic embeddings on every memory write**: Added `packages/backend/src/neo4j/embeddingService.ts` — a pure OpenRouter client (raw fetch, defensive runtime validation, no SDK or zod dep) that generates 1536-dim `openai/text-embedding-3-small` vectors. Threaded through all write paths: `createMemory` (web + MCP), `upsertFromSource` (Google Drive, OneDrive, Linear, Notion), so both user-authored memories and connector-synced documents get a semantic signal the moment they hit Neo4j.
- **Hybrid retrieval with Reciprocal Rank Fusion**: `retrieveMemories` now runs two legs — the existing fulltext query plus a new `db.index.vector.queryNodes` call over the new `memory_embedding` vector index — then merges by rank using RRF (k=60). Final score is `rrf*0.5 + recency*0.25 + confidence*0.25`, so "my dog" now surfaces memories about "my golden retriever" even when no keywords overlap. Matches-both, strong-semantic, and strong-content paths all produce distinct reason strings in the trace.
- **User-level API keys, not deployment-level**: Uses the existing (previously unused) encrypted `userEnvVars` plumbing via two new `envVars.ts` helpers — `requireUserEnvVarByClerkId` (throws) and `tryUserEnvVarByClerkId` (returns null). Every user pays for their own embeddings through their own OpenRouter account; plaintext only ever lives on the ActionCtx call stack. No backend billing surface, no shared quota pool.
- **Graceful degradation at every step**: Missing key or failed embedding call on create ⇒ memory still saves with `embedding: null` (backfill can fix later). Missing key on retrieve ⇒ falls back to fulltext-only scoring with a `"semantic search unavailable — set OPENROUTER_API_KEY"` trace reason. No feature blocks on embeddings being available.
- **Self-rescheduling backfill migration**: `internal.neo4jActions.migration.startEmbeddingBackfill` kicks off a cursor that pulls 50 memories at a time, groups by user, resolves each user's key once, batches embeddings via one HTTP call per user, writes back via `UNWIND`, and schedules itself again until drained. Users without a configured key are skipped and picked up on a later run.
- **Retrieval trace surfaced in the chat UI**: Added a hover card on each memory-reference chip in `ChatMessageItem` showing the total score, four-bar breakdown (content / semantic / recency / confidence), and the reason string. Schema + validator for `chatMessageMemoryRefs.refs` extended to persist trace on new messages (kept optional so legacy rows round-trip). Trace threads through both text chat (`useLocalChat`) and voice mode (`VoiceClient`).
- **Files affected**: `packages/backend/src/neo4j/embeddingService.ts` (new), `packages/backend/src/neo4j/setup.ts`, `packages/backend/src/neo4j/memoryService.ts`, `packages/backend/convex/lib/envVars.ts`, `packages/backend/convex/neo4jActions/{memories,connectorSync,mcp,migration}.ts`, `packages/backend/convex/{chat,memoryApi,schema}.ts`, `apps/chrome-extension/src/types/api.ts`, `apps/web/src/hooks/useLocalChat.ts`, `apps/web/src/components/voice/VoiceClient.tsx`, `apps/web/src/components/chat/_components/ChatMessageItem.tsx`
- **Reason**: vmem's retrieval was fulltext-only, so pure-semantic queries ("my dog" → "my golden retriever") returned nothing relevant. Adding embeddings without losing the exact-keyword strengths required a hybrid ranker; RRF is the textbook choice (score-free, robust to scale differences between Lucene and cosine). Keeping the API key user-scoped avoids centralized billing and matches the encrypted-env-var pattern already wired into Settings. Surfacing the score breakdown in the chat is what makes the "why this memory?" story concrete — matches one of vmem's core differentiators vs Mem0/Supermemory.

## OneDrive + Linear Connectors — 2026-04-24

- **OneDrive connector — full OAuth + sync flow**: Promoted the OneDrive "Coming Soon" stub into a working connector. OAuth uses Microsoft's v2.0 endpoint with `Files.Read.All offline_access` scopes (personal accounts only); sync pulls root-level `.txt`/`.md`/`.docx` files via Graph API `?format=text` for server-side Word-to-text conversion, so we don't bundle a docx parser. Refresh tokens are rotated per Microsoft's spec — the refresh path persists the new refresh token when Graph returns one.
- **Linear connector — issues, comments, and projects**: New provider syncing issues (title + description + inline comments, stitched into a single memory body) and projects (stored as `sourceType: "linear_project"` so users can filter separately). Default pull is the last 30 days via GraphQL `updatedAt: { gte }` filter — cheap for daily sync; a "Sync all history" menu item does a one-shot full backfill when needed.
- **Split sync button for Linear**: `ConnectorCard`'s single "Sync Now" button becomes a split-button only for Linear — primary click fires the 30-day sync directly (most common path), with a chevron dropdown exposing both "Sync recent (30d)" and "Sync all history". Other providers keep the unchanged single-action button.
- **Refresh path generalized from Google-only to token-expiring providers**: `connectorSync.startSync` previously hard-coded `provider === "google_drive"` for the refresh branch. Now covers both Google Drive and OneDrive, with per-provider env/URL switching inside the branch. Notion and Linear skip the path entirely (both have non-expiring tokens).
- **New `LinearIcon` SVG component**: `@tabler/icons-react` doesn't ship `IconBrandLinear`, so added an inline SVG component using Linear's brand mark. `ConnectorCard`'s `iconMap` resolves the string key `"IconBrandLinear"` to it the same way it resolves Tabler icons, keeping the card render path provider-agnostic.
- **Files affected**: `packages/backend/convex/schema.ts`, `packages/backend/convex/connectors.ts`, `packages/backend/convex/connectorOAuth.ts`, `packages/backend/convex/connectorSync.ts`, `packages/backend/convex/neo4jActions/connectorSync.ts`, `apps/web/src/components/ConnectorCard.tsx`, `apps/web/src/components/LinearIcon.tsx` (new)
- **Reason**: vmem shipped with Google Drive + Notion as the only working connectors. OneDrive was a stub and Linear didn't exist — both are common sources for knowledge work (docs, issues, project plans). OneDrive unlocks Microsoft 365 users; Linear unlocks engineering teams who keep context in issues and projects.

## Neo4j Seed + Unseed Scripts — Test Data Management — 2026-04-24

- **Restored `packages/backend/src/neo4j/seed.ts` from git history**: Reincludes 257+ handcrafted memories + 4000+ procedurally-generated memories across 3 test users, with relationships, tags, and event audit trails for realistic testing and performance benchmarking.
- **Created `packages/backend/src/neo4j/unseed.ts` reverse cleanup script**: Deletes all data for seeded user IDs, orphaned Tags, and orphaned Sources in one run — enables fast iteration during development without manual Neo4j console deletions.
- **Added `pnpm db:seed` and `pnpm db:unseed` scripts to package.json**: Both use `tsx --env-file=.env.local` for local environment loading, making seed/unseed accessible from the CLI without requiring manual driver setup.
- **Fixed seed.ts imports for new location**: Updated from old `./neo4j.js` and `./setup.js` paths to `./driver` and `./setup` to align with the post-Convex-migration architecture.
- **Files affected**: `packages/backend/src/neo4j/seed.ts` (restored), `packages/backend/src/neo4j/unseed.ts` (new), `packages/backend/package.json`
- **Reason**: Seeded test data is essential for perf testing the graph and list pages on realistic workloads (2000+ memories), and the old seed file was accidentally deleted during the Railway → Convex migration. Manual Neo4j deletion is slow for iterative testing; the reverse seed enables one-command cleanup.

## Memory List + Graph Pages — Pagination + Server-Side Filtering — 2026-04-24

- **List page architecture inverted from fetch-all to server-paginated**: Deleted the 120-round-trip fetch-all loop (100 memories per page in a JS loop over a 12k-memory user). New `useMemoryListPage` hook built on TanStack `useInfiniteQuery` streams pages on demand via `Virtuoso` `endReached` callback — first page renders in <300ms instead of 10s.
- **All memory filters pushed into Cypher for single-roundtrip queries**: Profile, type, status, source, tags, and fulltext search now land in the Neo4j MATCH + WHERE clauses instead of fetched-then-JS-filtered. `listMemories` unified list + search paths via `matchPrefix` + `orderClause` branching; `searchMemories` now a thin wrapper that delegates.
- **Graph nodes bounded to most-recent 2000 via `ORDER BY…LIMIT` in MATCH**: `getGraphData` previously scanned unbounded memory sets then capped in JS. Now uses the new `memory_user_status_created` composite index to seek nodes already sorted by creation time, so the planner does a single index seek + already-sorted output with no Sort op.
- **RELATES_TO edges scoped to 2000-node subgraph via CALL**: `getGraphData` no longer scans all user edges then filters post-hoc. A post-match `CALL (nodeIds) { MATCH (a:Memory)-[r]->(b:Memory) WHERE a.id IN nodeIds AND b.id IN nodeIds }` subquery reduces the edge traversal to O(edges_in_subgraph) instead of O(all_user_edges).
- **Tag-edge cartesian tightened via per-tag memory lists**: Tag-edges query collects memories per tag with `UNWIND memsForTag AS m1 UNWIND memsForTag AS m2`, so pair generation is bounded by the 500-cardinality gate instead of a double-scan of the entire Memory table — O(n²) pairs per dense tag stays under 500×500.
- **Local graph rewritten with Quantified Path Pattern**: `getLocalGraph` replaces `[:RELATES_TO*1..2]` with `((a...)-[:RELATES_TO]-(b...)){1,2}(neighbor)` so per-hop filters stop expansion early at suppressed/wrong-user nodes instead of traversing then discarding.
- **New composite index `memory_user_status_created` on (userId, status, createdAt)**: Covers the universal pattern used by list + graph + stats queries. Lets the planner do a single seek for `WHERE userId = $u AND status IN […] ORDER BY createdAt DESC`.
- **MemoryContext exposes `useMemoryListPage` + `useMemoryListFlat` hooks**: Bounded fetch of 1000 most-recent memories still backs context consumers (tag suggestions, filter-option derivation). Infinite-query hooks support the paginated list view.
- **MemorySearch switched to paginated rendering**: Now uses `useMemoryListFlat(filters)` with `Virtuoso endReached`. Removed the client-side JS filter chain for memories — filters arrive pre-applied from Cypher. Wiki + skills stay client-filtered (small, single-query loads).
- **Bug fixes in filter handling**: Search results now respect type/status/tag/profile filters (previously ignored when searchQuery present). Total count now correct (previously `= page.length`).
- **Files affected**: `packages/backend/src/neo4j/setup.ts`, `packages/backend/src/neo4j/memoryService.ts`, `packages/backend/convex/memoryApi.ts`, `packages/backend/convex/neo4jActions/memories.ts`, `apps/web/src/components/contexts/MemoryContext.tsx`, `apps/web/src/components/MemorySearch.tsx`
- **Reason**: List and graph pages both felt slow (10s baseline on 12k-memory user). Root causes were architectural (fetch-all + JS filter loop) and query-side (unbounded scans + O(n²) operations). The new design streams data on demand, pushes all filtering into Cypher, bounds graph scans to a 2000-node window, and runs in <1s end-to-end.

## Graph Payload Slimming — Lazy Memory Content + Query Restructure — 2026-04-24

- **Memory content dropped from graph payload, lazy-fetched on hover/click**: `getGraphData` / `getLocalGraph` no longer return `m.content` on memory nodes (wiki docs + skills still inline their content — small set, not the bottleneck). New `graphApi.getNodeContent` action fetches a single memory body by id on demand, and `MemoryGraph` caches results client-side in a `Map` keyed by memory id with in-flight deduping. Graph payload dropped from 1.13 MiB to well under 1 MiB for 2000-memory users, unblocking future re-enabling of action-cache if wanted
- **Nodes + relates-to collapsed into one session via CALL subquery**: `getGraphData` previously opened three parallel Neo4j sessions (nodes, relates-to, tag-edges). Combined nodes + relates-to into a single session using a post-match CALL subquery so both land in one Aura round-trip — one fewer connection-acquire + one fewer network hop per graph fetch. Tag-edges stays on its own session (different traversal pattern and `m.userId` index entry)
- **Composite index `memory_user_status` added**: Auto-created on boot via `setup.ts`. All graph/list queries filter by `userId` then by `status IN ['active', 'pinned']`; this index lets the planner do a single index seek instead of seeking on `userId` and post-filtering row-by-row. Same pattern as the existing `memory_user_created` index
- **Tag-edges first `MATCH` now includes status filter**: The tag-popularity pre-filter (`WHERE cnt BETWEEN 2 AND 500`) previously counted archived/draft memories against the per-tag cardinality, which inflated the cardinality and wasted work. Now filters by `status IN ['active', 'pinned']` before the count, matching the subsequent pair match and taking full advantage of the new composite index
- **Client-side timing log in `useGraphData`**: `[graph] fetch+parse: Xms (nodes=N tagEdges=N relatesTo=N)` logs once per fetch. Cheap to keep on in production and makes it trivial to diagnose future slowdowns (network vs. Cypher) without opening DevTools Network tab
- **Files affected**: `packages/backend/src/neo4j/memoryService.ts`, `packages/backend/src/neo4j/setup.ts`, `packages/backend/convex/neo4jActions/graph.ts`, `packages/backend/convex/graphApi.ts`, `apps/web/src/hooks/useGraphData.ts`, `apps/web/src/components/MemoryGraph.tsx`, `apps/web/src/components/_components/GraphNodeTooltip.tsx`, `apps/web/src/components/_components/GraphDetailPanel.tsx`, `apps/web/src/components/_components/canvas/types.ts`, `apps/web/src/components/_components/graph-types.ts`, `apps/web/src/components/_components/graph-data.ts`, `apps/web/src/components/codebases/CodebaseGraph.tsx`, `apps/web/src/hooks/useCodebaseGraphController.ts`
- **Reason**: Graph view still felt slow at ~10s after the previous round of Cypher wins. Payload size was a large hidden contributor — 1.13 MiB over the wire for a 2000-memory user, most of it in `m.content` that the UI only ever showed in a two-line tooltip clamp. Lazy-loading content on hover/click keeps the initial graph response tiny, and the query-side wins (one fewer session, composite index, status-filtered tag pre-filter) compound to cut Aura-side latency

## Neo4j Query Latency — Tag-Edge Scoping + Driver Pool Tuning — 2026-04-23

- **Tag-edges Cypher rewritten to scope to user first**: `getGraphData` previously scanned ALL tags globally via `MATCH (t:Tag) WITH t, size([subquery...])`, then computed user-scoped cardinality with an O(total_tags) operation before filtering. Now uses `MATCH (:Memory {userId})-[:TAGGED_WITH]->(t:Tag) WITH t, count(*) AS cnt WHERE cnt BETWEEN 2 AND 500` — starts from the Memory.userId index (fast), uses a cheap aggregation, and gates on [2, 500] so tags that can't contribute to a weight-≥2 edge are skipped immediately
- **Neo4j driver connection pool tuned for Convex warm containers**: Added three settings previously at default: `maxConnectionPoolSize: 10` (down from 100 — smaller pools warm faster on cold starts), `connectionAcquisitionTimeout: 10_000` (fail fast vs 60s hang), and `connectionLivenessCheckTimeout: 2000` (ping idle connections before reuse, since Aura silently drops idle TCP after a few minutes). These address the pattern where Convex containers live for hours but the driver is occasionally recreated, and stale connections cause TCP timeouts on first query
- **Expected improvement**: 2–5s shaved from graph load time (tag-edges rewrite targets O(total_tags) global scan; driver pool tuning reduces TCP stall on cold/stale connections)
- **Files affected**: `packages/backend/src/neo4j/memoryService.ts` (tag-edges query), `packages/backend/src/neo4j/driver.ts` (pool config)
- **Reason**: Graph view still felt slow at 10s despite earlier Cypher optimizations. Tag-edges query was a pure optimization miss; tag index is the wrong starting point for user-scoped pair computation. Driver pool config is a common miss on managed Neo4j services where connections are killed silently

## Audit-Log Query Inlining + Adapter Removal — 2026-04-23

- **Removed `packages/backend/convex/apiLogs.ts` adapter entirely**: The adapter was a thin pass-through over `auditLog.queryByActor` that both shaped rows AND computed the summary (total / success rate / avg duration). Frontend now calls the audit-log component directly via a narrow auth-scoped query — one fewer backend module to maintain.
- **New `auditLog.listMyApiRequestEntries` auth-scoped pass-through**: Lives next to the shared audit-log client. Pins `actorId = ctx.userId` via `authQuery` so a caller can never query another user's audit trail — avoids the library's `exposeAuditLogApi` helper, which accepts `actorId` from the caller and would leak cross-user data if exposed naively. Returns the minimal `{_id, endpoint, status, durationMs, originalTimestamp}` shape; summary + ISO formatting moved to the client.
- **Slimmed `memoryEvents.getRecentEvents` to raw pass-through**: No longer reshapes each audit entry into the legacy `{eventType, memoryId, payload}` row or carries the reverse-action map. Returns `{_id, action, resourceId, payload}` directly; the web hook owns the `action → MemoryEventType` translation now.
- **`useMemoryEvents` hook owns the action → eventType mapping**: Added a local `EVENT_FOR_ACTION` map (inverse of backend's `ACTION_FOR_EVENT`). A `useMemo` derives the event list from raw entries, keeping the existing effect loop unchanged.
- **`usage.tsx` computes summary + logs client-side with `useMemo`**: Pulls up to 1000 entries for the aggregate, sorts + slices + ISO-formats a 100-row window for the table. Data source and presentation now live side-by-side — table size, sort order, and aggregation logic are all tweakable without a backend round-trip.
- **`ApiLogsTable` decoupled from Convex function types**: Replaced `FunctionReturnType<typeof api.apiLogs.listMy>[...]` with a local `ApiLogItem` interface. The table now takes the row shape its caller computes, not a shape dictated by a specific backend function.
- **Strict typing preserved**: Every narrow from the audit-log client's `any` return uses `typeof` checks before assignment; no `any`/`unknown`/`as`/`!` introduced anywhere. Convex `returns:` validators gate the wire shape at runtime as a second line of defence.
- **README update**: `packages/backend/README.md` no longer lists the phantom `apiRequestLogs` table or `apiLogs.ts` module; now mentions that all audit trails live in the `convex-audit-log` component.
- **Files affected**: `packages/backend/convex/auditLog.ts`, `packages/backend/convex/memoryEvents.ts`, `packages/backend/convex/apiLogs.ts` (deleted), `packages/backend/README.md`, `apps/web/src/hooks/useMemoryEvents.ts`, `apps/web/src/routes/_main/settings/usage.tsx`, `apps/web/src/components/api-logs/ApiLogsTable.tsx`
- **Reason**: The adapter pattern preserved the frontend shape during the audit-log cutover, but it kept reshape logic on the server where it had no reason to live. Inlining removes a redundant backend module, tightens the surface to one auth-scoped query + one raw event stream, and puts presentation logic next to the component that renders it.

## Dashboard Read Latency — Cypher Optimizations + Action Cache — 2026-04-23

- **Tag-edge computation moved from JS into Cypher**: `getGraphData` and `getLocalGraph` previously materialised every memory + its tags, then computed shared-tag pairs in an O(n²) JavaScript loop. Now a single Cypher pattern `(m1)-[:TAGGED_WITH]->(t)<-[:TAGGED_WITH]-(m2) WHERE m1.id < m2.id` returns each pair once with its weight and shared tag names, executed in parallel with the nodes query via separate sessions (honours the "no parallel runs on one session" Neo4j rule in CLAUDE.md)
- **Popular-tag pre-filter preserved**: Added a `size([(t)<-[:TAGGED_WITH]-(:Memory {userId: $userId}) | 1]) <= 500` guard so mega-tags with hundreds of memories can't blow up the pair count — matches the heuristic the old JS implementation used. Skipped on `getLocalGraph` since the focused neighbourhood is already LIMIT 500
- **Stats growth query rewritten**: The old `range(0, 6) + UNWIND + OPTIONAL MATCH` pattern scanned the memory table 7 times per dashboard load to compute cumulative daily totals. Replaced with one baseline-before-window query + one per-day delta query, then a 7-step JS cumulative walk — a single linear scan of in-window rows does the work of 7 full scans
- **Tag filter short-circuits on tag index**: `listMemories` / `listMemoriesForTeam` previously filtered tags with a per-memory relationship-counting subquery. Rewritten as an index-joined `MATCH (m)-[:TAGGED_WITH]->(ft:Tag) WHERE ft.name IN $filterTags WITH m, count(DISTINCT ft) AS matchedTags WHERE matchedTags = $filterTagsCount` that hits the Tag name index once instead of scanning relationships per memory
- **@convex-dev/action-cache v0.3.0 installed**: Registered the component in `convex.config.ts` so Convex actions can be wrapped with TTL-scoped result caching. Cache key is the stringified args, so `clerkId` + `profileId` + filters naturally scope per-user with zero leak risk
- **Two dashboard hot-paths cached with 30s TTL**: `getStatsInternal` and `getRecentActivityInternal` wrapped via `ActionCache.fetch` in `dashboardApi.ts`. Versioned cache names (`-v1`) let us bump the key if the action's return shape ever changes
- **Graph cache removed after hitting Convex's 1 MiB value-size limit**: Initially wrapped `getGraphDataInternal` too, but production graphs with many memories + full content routinely serialised past 1 MiB, causing the cache put mutation to throw and take the graph action down. Reverted to a direct `ctx.runAction` call; the Cypher-side optimisations carry the latency win on their own. Inline comment documents the decision and the "drop content, fetch on hover" path if we ever want to retry caching
- **Narrowly scoped caching — write paths, MCP retrieve/search, and per-memory local-graph explicitly NOT cached**: Lists, search, and LLM-facing retrieve paths stay live because seconds-stale search results would be confusing after a create. `getLocalGraphInternal` and `getProfilesStatsInternal` skipped because their args (per-memory focus, per-profile-array) would explode the cache key space with a poor hit rate — inline comments in both files document the reasoning
- **No manual invalidation code**: The 30s TTL means stats/graph can show up to 30s-stale data after a write, which matches the user's accepted staleness budget. Avoids the complexity of write-path cache busting entirely
- **Files affected**: `packages/backend/src/neo4j/memoryService.ts` (Cypher for `getGraphData`, `getLocalGraph`, `getStats`, `listMemories`, `listMemoriesForTeam`), `packages/backend/convex/convex.config.ts` (component registration), `packages/backend/convex/graphApi.ts` (cache wrapper), `packages/backend/convex/dashboardApi.ts` (2 cache wrappers), `packages/backend/package.json` (new dep)
- **Reason**: Dashboard felt slow because every tab switch re-ran Neo4j traversals with no caching layer, and two of those traversals were doing work that belonged in Cypher. Optimizing the queries is a correctness/quality fix that pays off regardless of caching, and the 30s cache absorbs repeated tab switches and React re-renders on top. User accepted seconds of staleness on dashboard reads as the explicit trade-off

## Action Retrier + Audit Log Components — Phase 1 & 2 Complete — 2026-04-23

- **Action Retrier for idempotent external calls**: Wrapped fire-and-forget sync actions (Google Drive, Notion) with `@convex-dev/action-retrier` — 500ms→1s→2s→4s exponential backoff (4 attempts max) ensures transient network failures don't surface as user-visible errors on flaky connections
- **Unified audit trail with convex-audit-log**: Replaced fragmented `memoryEvents` (5-min TTL) + `apiRequestLogs` tables with a single permanent `convex-audit-log` component; all backend state changes (memory lifecycle, proposed-update approvals, API key creation/revocation, team/profile/connector operations) now logged with actor, resource, severity, and before/after diffs where applicable
- **Memory event dual-write → live adapter**: `memoryEvents.getRecentEvents` now reads from audit log (via `queryByActor` + reverse-mapped actions) and reshapes results into the legacy `{eventType, memoryId, payload}` shape, keeping the web graph view's `useMemoryEvents` hook unchanged
- **API request logs adapter**: `apiLogs.listMy` rewritten as an adapter over `auditLog.queryByActor({actions: ["api_request"]})` preserving the original `{summary:{totalRequests, successRate, avgResponseMs}, logs:[…]}` shape; no frontend edits required to `usage.tsx` or `ApiLogsTable`
- **Severity mapping**: HTTP status codes now map to audit-log severity (2xx→info, 4xx→warning, 5xx→error); security events (key revoke, team delete, connector disconnect) surface at warning/error level
- **Backfill + cleanup**: Two-phase migration ran without downtime — backfilled 2 legacy memory events, cleared both legacy tables, dropped `memoryEvents` + `apiRequestLogs` from schema, removed backfill code. All queries deployed and live.
- **Strict typing**: No `any`/`unknown`/`as`/`!` in new audit code; `ResourceTypes` constants prevent string drift across call sites; audit-log metadata redacts PII fields (email, phone, encrypted tokens) automatically
- **Files affected**: `convex.config.ts`, `retrier.ts` (new), `auditLog.ts` (new), `memoryEvents.ts`, `apiKeys.ts`, `apiLogs.ts`, `connectorSync.ts`, `proposedUpdateApi.ts`, `teams.ts`, `profiles.ts`, `connectors.ts`, `connectorOAuth.ts`, `schema.ts` (dropped 2 tables), `backfill.ts` (deleted post-migration)
- **Reason**: Memory lifecycle ("pin, suppress, expire, audit trail") and proposed-update approval are core vmem differentiators. Single audit log replaces ad-hoc event logging, enables compliance/debugging/forensics, and lets us surface approval workflows to the frontend. Retrier eliminates silent external-service failures on transient network issues.

## Breadcrumb Navigation for Detail Pages — 2026-04-22

- **New Breadcrumb component in @vmem/ui**: Created reusable `Breadcrumb` / `BreadcrumbLink` / `BreadcrumbPage` / `BreadcrumbSeparator` primitives using Radix Slot for type-safe routing; parent segments render as muted links (hover→foreground), current segment is foreground non-clickable
- **PageContainer breadcrumb prop**: Added optional `breadcrumb?: ReactNode` prop that renders in place of the `<h1>` title; mobile topbar still shows title via PageTitleContext, desktop hides h1 when breadcrumb is present
- **Detail pages migrated to breadcrumbs**: Removed back buttons from `/codebases/$id` and `/teams/$teamId`, replaced with breadcrumbs (e.g. `Codebases / acme-corp/api` and `Teams / {teamName}`); moved page meta (branch, status, etc.) to `centerSection` for cleaner header layout
- **FilesClient breadcrumb consistency**: Refactored `BreadcrumbNav.tsx` to use the new @vmem/ui primitive instead of custom styles; folder navigation (nuqs state update) now follows the same pattern as detail pages
- **Updated CLAUDE.md**: Added "Detail Page Headers" section documenting the pattern for future detail pages — breadcrumbs replace back buttons, page meta goes in center, actions in right
- **Files affected**: `packages/ui/src/ui/breadcrumb.tsx` (new), `packages/ui/src/index.ts`, `apps/web/src/components/PageContainer.tsx`, `apps/web/src/routes/_main/codebases/$id.tsx`, `apps/web/src/routes/_main/teams/$teamId/index.tsx`, `apps/web/src/components/files/BreadcrumbNav.tsx`, `CLAUDE.md`
- **Reason**: Detail pages with "Title / Back Button" layout read in the wrong order (back belongs before title, not after). Breadcrumbs provide clearer navigation hierarchy, reduce button chrome, and establish a consistent pattern for all detail pages.

## Company Knowledge (Teams) — Shared Profiles, Members, Attribution — 2026-04-22

- **Teams primitive**: Users can now create teams, invite teammates by email (instant-add if a vmem account exists; no invite tokens, no email sending), and belong to many teams at once with `owner` / `member` roles
- **Shared team profile**: Every team gets exactly one shared profile — all members save memories into the same pool, and the profile appears in every member's ProfileDropdown grouped under a new "Teams" section with a pill badge
- **Memory attribution preserved on leave**: Team memory reads filter by `profileId` alone (not `userId`), so when someone leaves the team their memories stay with the team and the original "Saved by X" attribution is retained
- **Creator-or-owner edit/delete**: Team memories can be edited or deleted by the creator or any team owner; non-owners are blocked from mutating others' entries
- **New routes**: `/teams` (card grid + create dialog) and `/teams/$teamId` (Overview stats, Knowledge memory list with "Saved by" chips, Members management, Settings — Settings tab owner-only) with nuqs-backed tab + filter state
- **Neo4j scope refactor**: Memory service entry points now take a discriminated scope (`personal` vs `team`) — every Cypher path that filtered by `m.userId` branches on scope; the team branch filters by `profileId` and resolves permitted members via Convex
- **Backend shape**: New `teams` + `teamMembers` tables, `teamId` added to `profileFields`, new `convex/teams.ts` with full CRUD + membership API; `users.getByClerkIds` query powers attribution lookups across the frontend
- **No `as` casts at client boundary**: Public team APIs accept `v.string()` and normalize server-side via `ctx.db.normalizeId`, keeping the CLAUDE.md "no type assertions" rule intact all the way through the stack
- **Tooling**: Added `apps/web/scripts/generate-route-tree.mjs` so the TanStack Router route tree can be regenerated headlessly (matches the Vite plugin config) without spinning up the dev server — unblocks CI typecheck after route additions
- **Files affected**: `schema.ts`, `validators.ts`, `teams.ts` (new), `profiles.ts`, `memoryApi.ts`, `users.ts`, `neo4jActions/memories.ts`, `neo4j/memoryService.ts`, `sidebar/nav-config.ts`, `ProfileDropdown.tsx`, `routes/_main/teams/**` (new folder with index, `$teamId/index`, `-searchParams.ts`, and 5 subcomponents), `scripts/generate-route-tree.mjs` (new)
- **Reason**: vmem had no multi-user story — every memory was locked to one creator. Teams unlock the "company knowledge base" use case where a whole team contributes to and searches one shared brain, with attribution, role-gated mutation, and member churn handled cleanly.

## Source & Type Filters for Memory Graph + Unified nuqs State — 2026-04-21

- **Graph view filter parity with list view**: Graph now exposes all 5 filter tabs (Profile, Kind, Tags, Source, Type) in the UnifiedFilterPanel — previously only Profile/Kind/Tags were available
- **Unified URL-backed filter state**: MemoryGraph swapped local `useState` Sets for nuqs `useQueryStates(memoriesSearchParams)` — tags, kinds, sources, types, and profile all persist in the URL and carry over when switching graph ↔ list view
- **Backend projection**: `graphApi.getGraphData` / `getLocalGraph` now return `source` and `type` on memory nodes; Neo4j Cypher RETURN clauses and `memoryService` types extended to forward the fields
- **Frontend data model**: `ApiGraphNode` gains optional `source`/`type`; new `getAllSources()` / `getAllTypes()` stat helpers mirror `getAllKinds`; `buildGraphData()` signature extended with `activeSources` / `activeTypes` filters
- **Non-memory passthrough**: Source/Type filters narrow only memory nodes — wiki/skill nodes pass through unchanged, matching the list-view convention in `listItemMatchesSourceFilter` / `Type`
- **UnifiedFilterPanel**: Added optional `typeCounts` override prop (mirrors existing `kindCounts` pattern) so graph view can supply its own counts without constructing synthetic `Memory[]`
- **Files affected**: graphApi.ts, memoryService.ts, neo4jActions/graph.ts, useGraphData.ts, graph-data.ts, MemoryGraph.tsx, GraphControlPanel.tsx, UnifiedFilterPanel.tsx, routes/\_main/memories/index.tsx
- **Reason**: Users couldn't filter the graph by memory source or type, making the graph/list views feel inconsistent; filter state resetting on view switch was also annoying. Unifying both via nuqs makes filter URLs shareable and keeps the two views perfectly in sync.

## Unified Filter Panel for Memories List and Graph — 2026-04-20

- **Consolidated 5 filter buttons into single "Filter" popover**: Replaced separate Profile, Kind, Tags, Source, and Type filter buttons with a single unified filter panel featuring vertical tabs for each category
- **Vertical tab navigation with badges**: Each tab shows the category name with a badge indicating active filter count (e.g., "Tags (3)"); trigger button shows total active filter count
- **Live filtering with instant updates**: Filters apply immediately as selections change (no Cancel/Save needed); footer shows "Showing X of Y items" count
- **Clear all functionality**: Single "Clear all" button resets all filters; also appears on hover of the trigger button when filters are active
- **Graph view integration**: GraphControlPanel now uses the same UnifiedFilterPanel with 3 tabs (Profile, Kind, Tags) instead of separate collapsible sections; adapter logic converts between Set-based and array-based state
- **Deleted 7 filter components**: Removed ProfileFilter, ListKindFilter, MemoryTagFilter, MemorySourceFilter, MemoryTypeFilter, GraphKindFilter, GraphTagFilter — all logic consolidated into UnifiedFilterPanel
- **Reason**: 5 separate filter buttons cluttered the UI and took up horizontal space; unified panel provides cleaner interface while maintaining full filter functionality with better discoverability

## Activity Page Scrollbar Consistency — 2026-04-20

- **PageContainer scrollRef prop**: Added optional `scrollRef` callback prop to expose the scroll container (motion.div) for virtualized lists to use as custom scroll parent
- **Activity page refactor**: Removed `noScroll` prop and configured Virtuoso's `customScrollParent` to use PageContainer's scroll container, matching behavior of settings/models page
- **Reason**: Consistent scrollbar UX across pages — Activity page now uses parent-level scrollbar instead of Virtuoso's internal scrollbar, aligning with other pages that use PageContainer's default scroll behavior

## Profile Filtering for Memory List and Graph Views — 2026-04-20

- **Profile filter component**: Created reusable `ProfileFilter.tsx` popover component (single-select) showing all profiles with color dots, following ListKindFilter pattern
- **Memory interface updates**: Added `profileId?: string` to Memory type and ListItem.MemoryRowItem; updated `memoryToListItem()` and `listItemsToMemories()` helpers
- **Memory context updates**: Added `profileId` to ApiMemory interface and included in `apiToMemory()` mapping from backend
- **List view client-side filtering**: MemorySearch applies profile filter to all items, non-memory kinds (wiki, skills) pass through untouched (consistent with tag/source/type filters)
- **Graph view server-side filtering**: useGraphData hook now accepts profileId parameter, query key includes profileId for cache isolation; backend getGraphData/getLocalGraph actions accept optional profileId and pass to Neo4j service
- **URL state management**: Added `profile: parseAsString` to memoriesSearchParams via nuqs for persistent filter state alongside existing tags/sources/types
- **Component integration**: ProfileFilter added to MemorySearch toolbar and GraphControlPanel; both components receive selectedProfileId + onProfileChange props from their parent routes
- **Architecture clarification**: Updated CLAUDE.md to reflect that profile filtering IS allowed in views (unlike the strict "no profile filtering" rule previously documented), just not as a route-level separation (no /work/memories vs /personal/memories routes)
- **Files affected**: ProfileFilter.tsx (new), memories.ts, list-items.ts, MemoryContext.tsx, searchParams.ts, useGraphData.ts, graphApi.ts, neo4jActions/graph.ts, MemorySearch.tsx, MemoryGraph.tsx, GraphControlPanel.tsx, routes index.tsx, CLAUDE.md
- **Reason**: Users wanted to view memories filtered by profile in both graph and list views without splitting routes; hybrid approach (server-side for graph to respect 2000-node cap, client-side for list to keep logic simple) balances performance and simplicity

## Profile UX Overhaul: Save-Time Profile Selection — 2026-04-20

- **Shifted from global "active profile" to save-time profile selection**: Users now choose which profile to save a memory to when creating/saving, instead of setting a global profile that persists. Source-specific defaults (web app, chrome extension) replace the single `activeProfileId`.
- **Backend schema migration**: Replaced `userSettings.activeProfileId` with `defaultProfiles: { web?: Id<"profiles">, extension?: Id<"profiles"> }` to support per-source defaults. Added `getDefaultProfile(source)` and `setDefaultProfile(source, profileId)` queries/mutations.
- **Memory creation with profile selection**: Added optional `profileId` parameter to `createMemory` action, allowing memories to be saved to any profile at creation time rather than defaulting to the active profile.
- **Web app ProfileDropdown component**: Created reusable dropdown showing all user profiles with colored dots and names. Integrated into AddMemoryForm and AddMemoryModal at the top, with live default fetched from web source setting.
- **Web app settings redesign**: Replaced single "Active Profile" button with new "Default Profiles" section showing Web App and Browser Extension dropdowns, each with independent defaults managed via `setDefaultProfile`.
- **Chrome extension profile selection**: QuickSave tab now shows profile dropdown alongside save button. SettingsForm shows "Default Profile" dropdown to set the extension's default profile (persisted to both local storage and backend).
- **MCP list_profiles tool**: Added tool for Claude/agents to list all available profiles with ID, name, color, and icon. Agents can now ask users which profile to save to before calling memory_add.
- **Deleted ProfileSelector component**: No longer needed as profile selection moved to save-time. Removed from sidebar footer.
- **Files affected**: Schema.ts, userSettings.ts, memoryApi.ts, profiles.ts (backend); ProfileDropdown.tsx (new), AddMemoryForm.tsx, AddMemoryModal.tsx, SettingsForm.tsx, SidebarFooter.tsx, profiles.tsx (web); api-client.ts, types/api.ts, types/storage.ts, types/messages.ts, QuickSave.tsx, SettingsForm.tsx (extension); tools.ts (mcp).
- **Reason**: Save-time profile selection aligns with the architectural principle that profiles are for **organizing where memories get saved**, not for filtering views. Users can now flexibly choose profiles per-memory without changing a global setting, and multi-source defaults (web vs extension) allow independent defaults per device/app.

## Profile Stats in Selector Popover — 2026-04-20

- **Profile selector popover stats**: Shows `total (+today)` memory count next to each profile name when opening the profile selector — users can see distribution across profiles at a glance
- **New backend queries**: Added `getProfilesStats` action that fetches `{total, today}` for multiple profiles in parallel; added `profileId` param to `getStatsInternal` (Neo4j already supported filtering)
- **Key architectural decision**: Profiles are for **organizing where memories get saved**, NOT for filtering views. All main stats (dashboard, sidebar StatsCard, activity feed) always show user-wide totals. Profile selector breakdown is purely informational.
- **Files affected**: `packages/backend/convex/dashboardApi.ts`, `packages/backend/convex/neo4jActions/dashboard.ts`, `apps/web/src/components/sidebar/ProfileSelector.tsx`
- Reason: Users wanted visibility into how memories are distributed across profiles without changing the core principle that all views show total memories

## Chrome Extension: Light/Dark Mode Support with Convex Sync — 2026-04-20

- **Theme toggle in Settings tab**: Added Light/Dark/System theme selector dropdown with icons in the extension's Settings tab, synced to Convex `userSettings.theme` for cross-device consistency
- **CSS variable restructure**: Refactored `globals.css` from hardcoded dark colors to light/dark theme CSS variables (`:root` for light, `.dark` scope for dark), matching web app's design system
- **Dynamic theme application**: Created `useTheme()` hook for signed-in users that reads from Convex settings, applies `.dark` class to document root, and resolves "system" preference via `matchMedia`; created `useSystemTheme()` for signed-out users to follow OS preference
- **Real-time sync**: Theme changes in extension are reflected in web app instantly via Convex reactive queries, and vice versa — single source of truth
- **Flash prevention**: Added inline script in `index.html` to check sessionStorage cache or OS preference before React hydrates, preventing wrong-theme flashes on popup open
- **Files affected**: `apps/chrome-extension/src/popup/globals.css`, `apps/chrome-extension/src/popup/useTheme.tsx` (new), `apps/chrome-extension/src/popup/App.tsx`, `apps/chrome-extension/src/popup/_components/SettingsForm.tsx`, `apps/chrome-extension/src/popup/index.html`
- Reason: Extension was hardcoded to dark mode, inconsistent with web app's theming. Users can now match their OS preference or choose explicitly, and preference stays consistent across web and extension.

## Chrome Extension: Design System Alignment (Flat UI, Button Variants, Icons) — 2026-04-20

- **Flat content cards**: Changed page preview and pending update cards from `glass-panel-subtle` to `bg-muted/40` for flat tonal surfaces instead of glass morphism on content elements (glass UI reserved for layout)
- **Button variant consistency**: Primary action buttons (Save to vmem, Sync Bookmarks, Sync History) now use `default` variant (primary color fill) to match web app settings pattern; secondary actions (Update, Dismiss) use `outline`/`ghost` variants
- **Sign-in button alignment**: Changed Sign in button from `default` to `outline` variant to match web app settings button styling
- **Header separator**: Replaced `border-b border-border/30` with `bg-muted/20` for tonal surface contrast instead of borders (aligns with design system rule: no borders for visual separation between layout regions)
- **Action button icons**: Added `IconDeviceFloppy`, `IconBookmark`, `IconHistory` icons to main action buttons for visual consistency with web settings pages
- **Files affected**: `apps/chrome-extension/src/popup/_components/QuickSave.tsx`, `apps/chrome-extension/src/popup/_components/ImportPanel.tsx`, `apps/chrome-extension/src/popup/App.tsx`
- Reason: Chrome extension UI was inconsistent with web app design system (glass UI on content, button variants). Alignments ensure cohesive visual language across both apps (both use shared `@vmem/ui` component library)

## Chrome Extension: Interface design polish — 2026-04-20

- **Scale on press consistency**: Normalized all active/press states to `scale(0.96)` (was 0.97, 0.985 in different components) for consistent tactile feedback across popup buttons, tabs, and injected content script buttons
- **Hit area improvements**: Extended Switch (24px → 40px height), Download button, and selection popup (32px → 40px) with `::before` pseudo-elements to meet 40×40px minimum hit area requirement
- **Tabular numbers**: Added `tabular-nums` class to dynamic progress counters (sync %, progress displays) to prevent layout shift during rapid updates
- **Text wrapping**: Added `text-balance` to page title in QuickSave and `text-pretty` to signed-out message for improved typography
- **Image outlines**: Added subtle `outline outline-1 outline-white/10` to favicon in page preview for consistent depth separation
- **Tonal surfaces over borders**: Replaced `border border-border` on duplicate-save card with `glass-panel-subtle` for cohesive glass morphism design
- **Concentric border radius**: Fixed SelectItem radius from `rounded-md` to `rounded-lg` to match outer container radius + padding rule
- **Transition specificity**: Changed injected button transition from `all` to explicit `transform, background-color, box-shadow` for performance
- **Tab enter animations**: Wrapped TabsContent children in `motion.div` with `fadeUp` preset for polished tab switches
- **Files affected**: 11 files across `packages/ui/` and `apps/chrome-extension/`
- Reason: Compound small interface details into cohesive, premium feel; improves usability (hit areas, tabular-nums prevents shift) and tactile feedback (consistent scale-on-press)

## Interface Design System Refinements — 2026-04-19

- **Scale on press**: Changed button/tab/nav active states from `translate-y-0` to `active:scale-[0.96]` for tactile feedback; applied across 20+ interactive elements for consistency
- **Transition specificity**: Replaced `transition-all` with explicit property lists (`transition-[transform,background-color]`) across 15+ components to prevent unintended animations
- **Shadows over borders**: Removed 40+ hardcoded border dividers (`border border-border`) and replaced with tonal background colors (`bg-muted/*` variants) to align with glass morphism design system
- **Minimum hit areas**: Extended 8 small icon buttons (close, remove-tag, icon-sm/xs sizes) to 40×40px hit area via `before:absolute before:inset-[-4px/-6px]` pseudo-elements
- **Text wrapping**: Added `text-balance` to 12 headings across pages for improved typography and reduced orphans
- **Tabular numbers**: Added `font-variant-numeric: tabular-nums` to 8 dynamic number displays (stats, timestamps, counters) to prevent layout shift
- **Image outlines**: Added subtle `outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10` to 3 images for consistent depth separation
- **Concentric border radius**: Fixed 4 nested element radius pairs (e.g., `rounded-xl` parent + `rounded-xl` child → `rounded-2xl` + `rounded-lg`) per the `outerRadius = innerRadius + padding` rule
- **Dialog close button**: Fixed radius from `rounded-full` to `rounded-xl`, extended hit area to 40px, aligned with glass panel styling
- **Files affected**: 35+ component and route files across `packages/ui`, `apps/web/src/components`, `apps/web/src/routes`
- Reason: Compound these small details into a cohesive, polished interface that feels responsive and premium; aligns the entire codebase with the established glass morphism design language

## Web: Vite app finalized, Next.js removed — 2025-04-18

- Deleted `apps/web` (Next.js) and renamed `apps/web-v2` to `apps/web` — Vite/TanStack Router is now the primary web frontend
- Refactored all localStorage usage to `useLocalStorage` from usehooks-ts for reactive state sync, SSR hydration, and cross-tab sync — removed ~90 lines of manual localStorage helpers
- Added missing dependencies: `@built-in-ai/web-llm` and `@mediapipe/tasks-genai` that were imported but not declared in package.json (pnpm hoisting masked the issue)
- Added `.gitignore` for Vite/TanStack Router patterns including `stats.html` bundle analysis output
- Aligned Vite server config with conductor: kept `host: "0.0.0.0"` and `cors: false`, removed unnecessary custom port
- Reason: consolidates to single web app, eliminates maintenance burden of two frontends, cleans up localStorage patterns

## Web-v2: Auth routing refactor and build fixes — 2026-04-18

- Fixed pnpm lockfile corruption issue: regenerated `pnpm-lock.yaml` and added `onlyBuiltDependencies: ["esbuild"]` config to allow postinstall scripts, resolving missing vite/esbuild packages
- Replicated conductor's routing pattern: `beforeLoad` guards instead of `useEffect` redirects for faster auth state handling (redirect before render, not after)
- Refactored auth context: added `RouterContext<{ isSignedIn: boolean }>` to `createRootRouteWithContext()` so all routes can access Clerk auth state synchronously
- Moved ClerkProvider to `main.tsx` with loader pattern: wrapped `InnerApp` component tracks `useAuth()` and passes context to `RouterProvider`; shows `AppSkeleton` while Clerk initializes
- Reason: eliminates page flash on auth state change, matches production patterns (conductor), ensures 1-to-1 parity with original Next.js web app

## Vite + TanStack Router Migration — 2026-04-18

- Created `apps/web-v2` with Vite + TanStack Router for faster dev/build speeds — Next.js dev server was too slow for iteration
- Migrated all 23 routes to TanStack file-based routing: `__root.tsx` for providers, `_main/route.tsx` for protected layout, `$id.tsx` for dynamic routes
- Copied all components, hooks, lib files from `apps/web` with updated imports: `@clerk/nextjs` → `@clerk/clerk-react`, `next/link` → `@tanstack/react-router`, `next/image` → native `<img>`
- Configured nuqs with `nuqs/adapters/tanstack-router` adapter for URL state management
- Non-blocking Google Fonts via Conductor pattern (media="print" onload trick) instead of `next/font`
- Env vars renamed from `NEXT_PUBLIC_*` to `VITE_*` with simple runtime validation in `src/env.ts`
- `apps/web` (Next.js) preserved as backup — delete after `web-v2` is verified in production
- Reason: Vite HMR is sub-second vs Next.js 5-10s cold starts; TanStack Router provides type-safe routing without the RSC complexity we weren't using

## Settings: Chat export import to memories — 2026-04-14

- Added a Settings → Import flow so users can bring official ChatGPT or Claude data exports into vmem as Neo4j memories instead of replaying chats in the app
- Parses ZIP or JSON client-side and lets people pick which conversations to import before writing episodic memories with clear import tagging for retrieval
- Reason: makes external chat history usable inside the memory graph without duplicating it as in-app threads

## Extension settings: Convex + web settings page — 2026-04-14

- Store browser extension toggles (auto-sync, save popup on text selection) in Convex `userSettings` so the web app and extension share one source of truth instead of only local storage
- Added `/settings/extension` in the web app with the same two switches, wired to Clerk-authenticated Convex mutations
- Kept `chrome.storage` as a mirror refreshed from the popup, on service worker startup, and on a periodic alarm so background scripts and content scripts keep working without Convex in those contexts
- Reason: users can manage extension behavior from the main app; settings stay consistent when switching between web and the browser extension

## Chrome Extension: Local LLM Enrichment (Chrome AI + WebLLM) — 2026-04-14

- Implemented hybrid enrichment strategy: tries Chrome Built-in AI (Gemini Nano) first (Chrome 138+, zero download), falls back to WebLLM (Qwen 3 0.6B, ~400MB), skips enrichment if both unavailable (no server fallback)
- Created offscreen document architecture: Manifest V3 offscreen HTML + Service Worker messaging enables WebGPU inference in Chrome extensions
- Added background enrichment pipeline: non-blocking async tag generation after memory creation (doesn't fail memory save if enrichment fails)
- Integrated client-side enrichment with Convex backend: new `applyEnrichment` action applies tags to Neo4j graph with source: "client-enrichment" event tracking
- Built Settings UI controls: toggle for local enrichment, model status indicator (Chrome AI / Qwen 0.6B / Download), progress bar during model download, model load triggers via `LOAD_ENRICHMENT_MODEL` message
- Added enrichment message types: `GET_ENRICHMENT_STATUS`, `LOAD_ENRICHMENT_MODEL`, `MODEL_LOAD_PROGRESS` for async communication between popup, background, and offscreen
- Reason: eliminates OpenRouter API dependency and 400 errors during history sync; local inference provides privacy, reliability, and zero per-request cost; Chrome AI path requires no setup for modern Chrome; WebLLM fallback ensures compatibility with older Chrome versions

## Chrome Extension: Improved Popup UI — 2026-04-14

- Fixed active tab styling: replaced glassmorphic effect (border + shadow) with flat accent background to match web version
- Enhanced Save page tab with Raindrop-style page preview: displays current page favicon, title, URL (truncated), and timestamp ("Today at HH:MM AM/PM") before save button
- Refactored QuickSave component: added `useEffect` to fetch page info on mount, added helper functions (`formatTimestamp`, `truncateUrl`) for consistent date/URL formatting
- Reason: improves visual hierarchy and consistency between extension and web app, gives users context of what they're saving before confirming

## Chrome Extension: Migrated to ConvexHttpClient — 2026-04-14

- Fixed broken auto-sync: background service worker now uses `ConvexHttpClient` with Clerk JWT auth instead of custom HTTP routes
- Refactored `api-client.ts`: replaced raw `fetch()` calls to `/api/mcp/memories/*` (which expected MCP JWT) with `client.action(api.memoryApi.*)` calls that use the same Clerk auth as the popup
- Auth flow: `TokenSync` persists Clerk JWT to storage → background reads it → `ConvexHttpClient.setAuth(token)` → calls authenticated Convex actions
- Removed dead code: deleted `testConnection()` function, `TEST_CONNECTION` message type, manual API URL settings
- Aligned extension types with Convex: changed `MemoryNode.type` and `status` from union types to `string` to match Convex return shapes
- Reason: MCP HTTP routes were designed for MCP clients (custom JWT), not browser extensions (Clerk JWT). Using ConvexHttpClient unifies auth with popup.

## Graph API: Cap Arrays for Convex 8192 Element Limit — 2026-04-13

- Fixed graph endpoint crashing with "Array length is too long (10415 > maximum length 8192)" — Convex enforces a hard 8192 element limit on any array in a return value (applies to all Convex values, not just documents)
- Capped graph results to 2000 nodes / 4000 edges per array, with orphan edge cleanup — also improves d3-force rendering performance
- Documented JSON.stringify workaround as an alternative if full dataset is ever needed (strings only hit the 16 MiB size limit, no array cap)

## Memory Engine: Migrated from Hono API to Convex "use node" Actions — 2026-04-13

- Eliminated Railway Hono API (`apps/api/`): all Neo4j queries and mutations now run inside Convex serverless functions via "use node" runtime
- Ported service layer to `packages/backend/src/neo4j/`: moved MemoryService (1330 lines), CodebaseService, Neo4j driver, and utilities outside convex/ to avoid bundler conflicts with Node.js dependencies (neo4j-driver, jsonwebtoken, node:crypto)
- Created 10 internal action files in `convex/neo4jActions/` (memories, enrichment, dashboard, timeline, relationships, graph, codebases, proposedUpdates, mcp, dbSetup) — all "use node", receive clerkId + args, return typed results
- Added 6 public API files (`convex/*Api.ts`): thin authAction wrappers that resolve Clerk ID via internal query, delegate to internalActions via ctx.runAction, no business logic
- Implemented 5 MCP HTTP POST routes in `convex/http.ts` at `/api/mcp/memories/*`: each verifies JWT token + calls internalAction in single hop (no intermediate REST layer)
- Updated MCP api-client.ts: changed base URL from Railway Hono to Convex site, updated all endpoints from `/v1/memories/...` to `/api/mcp/memories/...`
- Updated frontend hooks: replaced `authFetch(API_URL)` with `useAction(api.xxxApi.yyy)` wrapped in React Query for staleTime/invalidation (GraphData, CodebaseGraphData, TrailData, TimelineEvents, MemoryContext)
- Removed `useAuthFetch` hook and `NEXT_PUBLIC_API_URL` env var from frontend — no longer needed
- Fixed TypeScript: resolved TS7022 (implicit any) via explicit return type annotations on authActions; resolved TS2589 (excessively deep type instantiation) by using `v.string()` in authAction args instead of `v.union(v.literal(...))`, with runtime type narrowing in internalAction handlers
- Memory events pushed via `ctx.runMutation(internal.memoryEvents.pushEventInternal)` instead of HTTP client
- Enrichment scheduled via `ctx.scheduler.runAfter(0, internal.neo4jActions.enrichment.enrichMemory)` instead of fire-and-forget promises
- Reason: eliminates separate API deployment, reduces operational complexity, enables tight integration with Convex ecosystem (scheduler, mutations, actions), improves security (JWT verification in single hop), reduces latency (no HTTP round-trip)

## Chat UX: Provider Submenu, Reasoning UI, Assistant Avatar — 2026-04-13

- Redesigned model selector dropdown: models now grouped by provider (Qwen, Llama, Gemma, etc.) with nested submenus instead of flat list
- Expanded WebLLM model catalog from 10 to 12 models across 6 providers; added `provider` field and `groupByProvider()` helper; removed model descriptions for cleaner UI
- Added reasoning/thinking UI for local models: switched from `textStream` to `fullStream` to capture `reasoning-delta` parts, enabling the existing ChainOfThought accordion to render thinking from models like Qwen 3
- Added vmem assistant avatar to chat messages: assistant bubbles now show the vmem icon alongside responses
- Reason: improves model discovery with organized provider grouping, surfaces chain-of-thought from thinking models, gives assistant messages consistent visual identity

## Chat: Local LLM Only (Removed Cloud OpenRouter) — 2026-04-13

- Removed dual-mode chat (cloud/local toggle): chat now exclusively uses local WebLLM inference, eliminating dependency on OpenRouter for chat
- Deleted cloud chat backend mutations: removed `initiateStreaming` and `streamAsync` mutations that powered OpenRouter chat path
- Deleted `agent.ts`: removed Convex Agent instance configured with OpenRouter language model; refactored `getOrCreateThread` to use standalone `createThread()` from `@convex-dev/agent` framework
- Updated web chat UX: `useLocalChat` hook now self-manages thread creation (no longer receives `threadId` param), Chat component shows empty state with link to Settings when no local model loaded, removed ProviderToggle component entirely
- Updated mobile chat UX: collapsed 3 modes (`online/offline/offline_no_model`) to 2 (`ready/no_model`), removed online/cloud logic, always uses local inference with optional persistence to Convex when connected
- Removed `@openrouter/ai-sdk-provider` from backend dependencies; kept OpenRouter in `apps/api` for async memory enrichment (separate non-chat service)
- Reason: simplifies architecture (single LLM path), eliminates cloud API keys from backend, reduces costs, supports offline-first design; OpenRouter still available for memory enrichment via separate REST service

## Chrome Extension: Auto-Sync + Incremental Bookmarks/History — 2026-04-13

- Implemented auto-sync for bookmarks: new bookmarks sync instantly via `chrome.bookmarks.onCreated` listener without user clicking a button
- Implemented auto-sync for history: history syncs every 30 minutes via `chrome.alarms` API, only fetches entries since last sync (incremental)
- Added incremental sync for manual imports: both bookmark and history sync now filter by `dateAdded > lastBookmarkSync` / use `lastHistorySync` as startTime floor, preventing re-sending already-synced items
- Built in-memory concurrency locks: prevents overlapping auto-sync and manual-sync operations, UI shows "Sync already in progress" if user clicks while auto-sync is running
- Added sync timestamps to storage: `lastBookmarkSync`, `lastHistorySync` track last successful sync epoch time; first sync (timestamp = 0) imports everything (backwards compatible)
- Built auto-sync toggle in Settings: users can enable/disable auto-sync per-device, defaults enabled on install; toggle also controls alarm + listener registration
- Added last-sync timestamps to popup UI: each section (Bookmarks, History) shows "Last synced: Xm ago" / "Never synced" for visibility; renamed buttons "Sync Bookmarks" / "Sync History" to reflect incremental behavior
- Reason: eliminates manual sync friction, reduces API load by only sending new items, provides visibility into sync status, enables always-current memory context

## Auth Middleware: Fixed /codebases/sync Blocking — 2026-04-13

- Fixed auth middleware pattern `/codebases/:codebaseId` that was matching `/codebases/sync` and running Clerk auth on the internal endpoint
- Restructured middleware to use `/codebases/:codebaseId/*` pattern: requires trailing path segment, so doesn't match bare `/sync` route
- Extracted `verifyAuthHeader()` helper function from auth middleware for reusable auth verification without middleware
- Updated DELETE handler to verify auth inline: `const userId = await verifyAuthHeader(c.req.header("Authorization"))`
- Reason: allows `/codebases/sync` to use its own X-Internal-Secret authentication without middleware interference; sync endpoint can now reach handler and authenticate via internal API secret

## Selection Popup UI: Expand-on-Hover + Dark Mode — 2026-04-13

- Added expand-on-hover pill: selection popup starts as 32px icon circle, expands to 152px pill with "Save to vmem" text on hover, collapses back smoothly on mouse leave
- Label enters after width animation: text opacity lags 40ms behind expansion, fades out first on collapse — user never sees clipped text during resize
- Implemented dark/light theme awareness: detects OS color scheme preference via `@media (prefers-color-scheme)`, adapts popup background, text, border, and shadows for dark sites (dark bg gets light icon; light bg keeps current look)
- SVG icons use `currentColor`: vmem logo, checkmark, and X icon now inherit color from parent CSS, eliminating hardcoded fill/stroke values
- Reason: expand-on-hover improves discoverability (currently icon-only), dark mode prevents jarring white popup on dark sites, matches OS theme preference automatically

## GitHub OAuth: Moved to Convex HTTP Actions — 2026-04-13

- Migrated GitHub OAuth flow from Next.js API routes to Convex HTTP actions: callback URL now points to Convex site (`*.convex.site`) instead of Next.js domain
- Implemented state-based authentication: OAuth state tokens stored in new `oauthStates` table prevent CSRF attacks and enable atomic state consumption (defeats replay attacks)
- Frontend-driven return URL: frontend passes `window.location.origin` when initiating OAuth, supporting same Convex deployment for both dev and staging without env var configuration
- Eliminated public `storeConnection` action: callback logic now entirely internal (`handleGitHubCallbackInternal` internalAction), reducing surface area
- Reason: improves security (state validation, atomic consumption), simplifies multi-environment deployments, centralizes OAuth logic in Convex backend, fixes CSRF vulnerability in original code

## Codebases Feature: GitHub Sync + File Dependency Graph — 2026-04-12

- Implemented full GitHub integration: OAuth 2.0 connect flow stores encrypted access tokens in Convex with secure AES-GCM encryption (reuses apiKeys pattern)
- Built codebase sync pipeline: fetches TypeScript/JavaScript files from GitHub tree API, parses imports via regex (relative imports only), resolves paths against file tree, stores in Neo4j as CodeFile nodes with IMPORTS edges
- Created Neo4j schema for file-level dependency graphs: `CodeFile` nodes indexed on (userId, codebaseId), `IMPORTS` relationship edges with importPath metadata
- Implemented Hono API middleware: `/v1/codebases/sync` endpoint handles GitHub tree fetching + file content parsing in 20-file batches, `/v1/codebases/:id/graph` endpoint returns cached graph data (60s TTL), Neo4j service layer manages node/edge batch operations
- Built repository picker UI: list connected user's GitHub repos, search/filter, add repos to create codebase entries with real-time sync status (pending → syncing → synced/error)
- Implemented file dependency graph visualization: reused d3-force canvas engine from MemoryGraph, renders CodeFile nodes with degree-based sizing, import edges with strong force (0.7 strength like relates_to edges)
- Added directory filtering: group files by directory path, toggle directories to filter graph view, quick "All/None" buttons with file count badges and color-coded dots matching GraphTagFilter pattern
- Created detail panel on file click: shows filename, full path, directory, extension, lists imports (files this file imports) and imported-by relationships with navigation between related files
- Reason: enables visual code exploration at file level — developers can understand project structure, identify circular imports, and navigate between dependent files without leaving the graph

## Text Selection Popup for Chrome Extension — 2026-04-12

- Added Grammarly-style floating popup on text selection: ~28px circular vmem icon appears 8px below the highlighted text, offering one-click save to vmem
- Popup uses closed Shadow DOM for CSS/JS isolation from host page, preventing style conflicts on any website
- One-click save flow: selected text becomes the memory title (auto-truncated to 80 chars), tagged with hostname + "selection" for easy filtering
- Smart positioning with viewport boundary clamping: horizontally centers on selection, flips above if no room below, clamps to screen edges
- State machine with visual feedback: `ready` (icon) → `saving` (spinner) → `success` (checkmark, auto-hides 1.5s) / `error` (X icon, auto-hides 2s)
- Toggle in Settings tab: users can enable/disable the popup per-device, stored in `chrome.storage`, defaults to enabled
- Edge cases handled: min 3 chars to trigger, skips right-clicks, repositions smoothly on scroll/resize (RAF-throttled), preserves selection on button click via `preventDefault`
- Reason: right-click → "Save page" saves the entire page; users need a way to save just the text they want to remember without the clutter

## Files Page → File Explorer Redesign — 2026-04-12

- Redesigned `/files` from flat table view to full file explorer UI with folder hierarchy, breadcrumb navigation, and context menus — modeled on macOS Finder and Windows Explorer
- Added folder support: create folders with inline naming, navigate breadcrumbs to move between folders, `parentFolderId` field tracks hierarchy
- View toggle: grid (thumbnail/icon cards) and list (compact rows) views, persisted in URL via nuqs with independent sort controls (name, size, date)
- Multi-select workflow: click, shift+click, ctrl+click to select files; bulk actions bar appears with delete, download, and move-to-folder buttons
- Full-page drag-and-drop zone: drop files anywhere on the page to open upload modal pre-populated with dropped files
- Context menus on every item: Open (navigate for folders, preview for files), Download (files only), Move to…, Rename (folders), Delete
- Extracted shared `FileItem` type to `lib/file-types.ts` — single source of truth for files and folders with proper typing across all consumers
- Refactored into 14 focused sub-components in `_components/` (FilesClient orchestrator, FileGrid/FileListView for views, BreadcrumbNav, BulkActionBar, MoveFolderDialog, etc.) — page is now a thin server wrapper
- Added `useFileSelection` hook with `useReducer` for complex multi-select logic (range selection, select-all, toggle patterns)
- Status bar: Finder-style compact bottom bar showing item count and storage usage with thin progress indicator
- Reason: files page was a dead table with no navigation or bulk operations; real explorers organize files by folder, support multi-select, and provide quick actions

## Voice Route UI Redesign — 2026-04-12

- Redesigned `/voice` layout from top-to-bottom stack to a CSS Grid centered focus screen — the Persona orb is now the hero, vertically centered with generous breathing room
- Replaced the disconnected readiness card with inline pill badges (LLM, STT, TTS) below the orb and a one-click "Load All Models" button — orb shows dormant `asleep` state until models are ready
- Added colored dot indicators to the status line (red=listening, amber=thinking, green=speaking) with pulsing animation during active phases
- Enlarged mic button from 64px to 80px with shadow depth, icon cross-fade animation, and glass-interactive cancel button
- Moved conversation history into a collapsible bottom drawer — hidden by default with a "Show conversation" pill trigger, slides up as a glass panel showing all messages

## Per-Reply Token Usage in Chat — 2026-04-12

- Added Context hover card on every assistant message showing token usage breakdown (input, output, reasoning, cache) with a circular progress ring
- New `getThreadMessageUsage` backend query aggregates raw agent message usage per assistant bubble, with correct bubble-key mapping and full pagination
- Cloud chat usage appears automatically via Convex live query; local chat captures usage from AI SDK `streamText` and persists it through `saveLocalMessages`
- Context component (`packages/ui/src/ai-elements/context.tsx`) follows the AI SDK Elements compound component pattern — `Context > ContextTrigger > ContextContent > Header/Body` with per-row usage sub-components
- Supports both providers: cloud messages show server-reported usage, local messages show browser-reported usage (or nothing if unavailable)

## Consolidate Timeline into Memories — 2026-04-12

- Deleted `/timeline` route — History and Trail features now live contextually inside the memories detail panel instead of a separate page
- `MemoryDetailPanel` decomposed from 452-line monolith into tabbed shell (179 lines) with three tabs: Details, History, Connections
- History tab shows change timeline with word-level diffs inline when viewing any memory — no more navigating away
- Connections tab wraps existing `RelatedMemories` component, promoted from a footer section to a first-class tab
- Trail data enriches the memory list: selecting a tag in the sidebar now fetches trail metadata and shows violet "related" badges on connected list items
- Extracted `useAuthFetch` hook to deduplicate the authenticated fetch pattern across 3+ consumers
- Extracted `TagInputWithSuggestions` component from the edit form for reuse and to keep components under 250 lines
- Created `useTimelineEvents` and `useTrailData` hooks to encapsulate timeline API calls
- Removed Timeline from sidebar navigation
- Reason: timeline was a separate page that broke the user's flow — history and connections are more useful in context, right where you're already looking at a memory

## Local Voice Mode — 2026-04-12

- Added `/voice` route with push-to-talk voice interaction using browser-local STT (Whisper-base) and TTS (Kokoro-82M) via `@huggingface/transformers`
- Voice conversations share the same Convex thread as `/chat` — messages created in either route appear in both, tagged with distinct badges (`Cloud`, `Local Text`, `Local Voice`)
- New `Persona` animated orb component in `packages/ui` visualises session state (idle, listening, thinking, speaking) using motion/react — API matches upstream AI Elements for future Rive swap
- `VoiceContext` provider orchestrates the full mic → STT → local LLM → persist → TTS → playback pipeline with cancellation support at every step
- Voice model management added to Settings > Preferences with separate STT/TTS sections, download progress, and Kokoro speaker voice selector (17 presets)
- Readiness card on `/voice` shows load state for all three required models (chat LLM, Whisper, Kokoro) with inline load CTAs
- Reason: enables fully offline voice interaction without any cloud dependency, reusing the existing local WebLLM chat model as the assistant brain

## Local Graph Mode (Obsidian-style focus) — 2026-04-11

- Added local graph mode: double-click a memory node (or click "Focus" in its detail dialog) to see its 2-hop RELATES_TO neighborhood
- Backend: new `getLocalGraph()` method in memory-service runs a variable-length path query capped at 500 nodes, then computes edges within the subgraph
- Route: `GET /v1/graph?focus=memoryId` returns the focused subgraph with same response shape as global graph
- Frontend: "Back to global" button to return to full graph view, focus node highlighted with dashed ring
- Reason: global graph becomes unusable at high node counts. Local graph always renders <500 nodes regardless of total memories, enabling smooth navigation at any scale.

## Graph View Performance Optimization — 2026-04-11

- **Server-side tag-edge computation**: moved O(n²) tag co-occurrence computation from client to Neo4j Cypher query. Frontend useMemo is now O(n) mapping only.
- **Web Worker simulation**: d3-force physics runs in a dedicated Web Worker off the main thread. 100-tick warm-up no longer blocks the browser. Falls back to main-thread simulation if Worker creation fails.
- **Renderer batching**: nodes batched by color into single Canvas paths (one fill per color bucket instead of per-node). Edges batched by style. Glow/labels/edges skip at high node counts (>5k) or low zoom.
- **Frame-loop caching**: resolvedEdges cached (only rebuilt on edge change, not every frame). Spatial index rebuild throttled to every 3 frames with dirty flag.
- Reason: graph view was slow at >1k memories. These changes target ~10-20k smooth on global graph. Local graph mode (2-hop Obsidian-style) planned as follow-up for unlimited scale.

## Memories List View → File Browser Layout — 2026-04-10

- Replaced the flat card grid + tag badge filter with a file browser layout: left sidebar for tag navigation, right panel for memory list
- Flat tag list in sidebar with sort options: A–Z (default), Most used, Most recent
- Single-select tag navigation (like folder browsing) instead of multi-select AND filter
- Added `type` field to the frontend `Memory` interface (was already in the API but stripped during mapping)
- Search bar is now contextual — shows "Search in [tag]..." when a tag is selected
- Detail panel still slides out to the right when a memory is clicked
- Reason: the old tag badge filter didn't scale well with many tags and didn't communicate the memory type hierarchy

## Mobile Drawer Navigation, Logout, Record Tab — 2026-04-02

- Replaced bottom tab bar with drawer navigation (swipe from left or tap hamburger menu button)
- Added logout button to settings screen below the model list
- Added Record route (placeholder) as a new drawer item
- Each screen now has a header bar with menu icon for opening the drawer
- Added react-native-gesture-handler and @react-navigation/drawer as dependencies
- Reason: drawer navigation provides cleaner UX for 3+ routes vs cramped bottom tabs, and logout was missing entirely

## Mobile Chat Redesign — 2026-04-02

- Assistant messages: removed bubble background, made full-width to match web's MessageContent pattern
- ReasoningBlock: added sparkle icon, duration tracking, auto-expand while streaming, auto-collapse after done, rotating chevron
- ChatInput: redesigned as rounded container with borderless textarea, footer row with voice + send buttons
- VoiceButton: new component using expo-speech-recognition with animated ping rings while listening
- Settings: expanded from single model to 4-model selector (TinyLlama 1.1B, Llama 3.2 3B, Phi-3.5 Mini, Mistral 7B) with per-model download/delete/select
- model-manager: refactored for multi-model support with SecureStore persistence of active model ID
- Tab labels: applied Instrument Sans Medium font
- Reason: mobile UI diverged significantly from web's polished design, needed feature parity for voice input and model variety

## Graph Edge Labels, Sidebar Stats, Seed Data Overhaul — 2026-04-02

- Edge labels now appear on hover showing WHY two memories are connected (shared tags or explicit relationship reason)
- Sidebar stats ("12 added", "47 retrieved") were hardcoded — now fetches real data from `/v1/dashboard/stats`, showing "today" and "total" counts
- Added `memoriesAddedToday` to dashboard stats API (Cypher counts memories created since midnight)
- Rewrote all ~100 seed relationship reasons from generic ("both TypeScript patterns") to specific ("strict null checks catch the bugs useEffect cleanup prevents")
- Seed now creates MemoryEvent nodes so dashboard Recent Activity section is populated
- Seed dates now ensure ~15 memories in last 7 days and ~30 in last 30 days for realistic dashboard stats
- Reason: graph edge labels are needed to understand WHY nodes are related, not just that they are. Sidebar stats were always fake. Seed data quality directly affects demo credibility for thesis

## Mobile App UI Overhaul — 2026-04-02

- Ported web app's design system to mobile: HSL CSS variables in global.css, semantic Tailwind color tokens (background, foreground, primary, secondary, muted, accent, destructive, success, warning, border, card) with light/dark mode support
- Installed react-native-reusables pattern: new Button (CVA variants + TextClassContext), Input, Text, Card, Badge components in src/components/ui/ replacing the previous basic implementations
- Added Instrument Sans + Instrument Serif fonts via @expo-google-fonts packages, matching web's typography
- Replaced placeholder tab icons (circle/square Views) with Ionicons (chatbubble-outline, settings-outline) from @expo/vector-icons
- Themed tab bar background and tint colors using the new design tokens
- Restyled all screens (chat, settings, sign-in, sign-up) to use semantic token classes instead of raw Tailwind gray values
- Chat: EmptyState gets sparkle icon, MessageBubble uses card/primary tokens, ChatInput uses Ionicons arrow-up, Badge component for tool calls
- Settings: Card component wraps offline model section, Button component for actions, ProgressBar uses primary/muted tokens
- Added ThemeProvider from @react-navigation/native with NAV_THEME object for consistent navigation chrome
- Reason: mobile app lacked design consistency with web, had no real icons, no design tokens, and no component library. This brings both platforms to the same visual language

## Migrate Force Graph to Sigma.js — 2026-04-02

- Replaced ~856 lines of hand-rolled canvas force graph (ForceGraph.tsx, graph-physics.ts) with ~400 lines using @react-sigma/core + sigma.js WebGL renderer
- Graph now runs ForceAtlas2 in a web worker via @react-sigma/layout-forceatlas2, eliminating main-thread physics jank
- Simplified graph settings from 4 sliders (scalingRatio, gravity, repulsion, damping) to 2 (scalingRatio, gravity) since FA2 handles the rest
- Custom WebGL node glow program preserves the radial glow effect from satellite/constellation themes
- All interactions preserved: hover/dim, click detail dialog, node drag, shift+drag-to-link, zoom/pan, view theme switching
- Reason: the custom canvas renderer was fragile, hard to maintain, and slower than WebGL for large graphs. Sigma is built on graphology which was already a dependency

## Fix Mobile Chat Auth Bootstrap — 2026-04-02

- Mobile chat now waits for `ensureUserExists` to finish before entering the main app, removing the race where chat tried to create a Convex thread before the authenticated `users` row existed
- Hardened the mobile send path against undefined input so transient UI state cannot call `.trim()` on a missing value while chat is initializing
- Updated the Convex agent config to use `embeddingModel`, matching the current `@convex-dev/agent` API and removing the deprecation warning
- Reason: chat startup depended on auth, user bootstrap, and thread creation completing in the right order; making readiness explicit is simpler and more reliable than handling repeated server failures after mount

## Fix Mobile OAuth Callback Route — 2026-04-02

- Switched mobile Clerk SSO to `expo-auth-session` redirect URIs, matching the working pattern in `velth` instead of building the callback URL with `expo-linking`
- Added an Expo Router `app/sso-callback.tsx` screen so the app can land on the Clerk OAuth deep link without throwing an unmatched route error
- Reason: Google SSO was returning to `vmem://sso-callback`, but the app had no matching route and was not using the same native redirect URI pattern as the known-good mobile app

## Keep Pending Clerk Sessions Signed In On Mobile — 2026-04-02

- Updated mobile Clerk auth guards and the Convex auth bridge to use `treatPendingAsSignedOut: false`
- Reason: after OAuth returns to the app, Clerk can briefly hold a pending session; treating that state as signed out caused the app to redirect users back to the sign-in screen immediately after successful auth

## Finalize Mobile OAuth From The Callback Route — 2026-04-02

- Moved `WebBrowser.maybeCompleteAuthSession()` to the mobile root layout so Clerk OAuth can finish even when the app reopens on `sso-callback`
- Changed the callback screen to hold on a loading state briefly instead of immediately redirecting signed-out users back to sign-in
- Reason: if the callback route renders before the auth session is finalized, redirecting immediately can abort the Clerk flow before a user or session is created

## Handle Clerk OAuth Transfer + Missing Requirements — 2026-04-02

- Replaced the mobile OAuth callback placeholder with Clerk's documented sign-in/sign-up finalize flow, including transferable sign-in and sign-up cases
- Added a mobile `sso-continue` screen to collect missing first or last name fields when Clerk requires extra profile data before creating the user
- Reason: Google OAuth can legitimately return without `createdSessionId`; that means the flow must be completed from the callback route instead of being treated like a hard failure

## Adopt @neo4j/cypher-builder for dynamic queries — 2026-04-01

- Replaced string-concatenated WHERE/SET clauses in `listMemories` and `updateMemory` with `@neo4j/cypher-builder` for type-safe, composable query construction
- Added `cypher-helpers.ts` with a `buildAndRun` helper to bridge the builder's `.build()` output to neo4j-driver sessions
- Left the other ~37 static queries as raw parameterized Cypher — they have fixed structure and don't benefit from a builder
- Reason: dynamic string concatenation for WHERE conditions and SET clauses was the only injection-prone pattern; the builder eliminates it while keeping the codebase simple

## Fix Empty Memory Graph For Legacy Rows — 2026-04-01

- Treated Neo4j memories with no `status` field as `active` in the graph query so older rows still appear in graph view
- Stopped the graph client from turning failed `/v1/graph` requests into a fake empty state and now show the actual error instead
- Reason: the list view did not require `status`, but the graph view filtered on it strictly, so legacy data looked like "No memories to visualize" even when memories existed

## Fix Railway Deploys For API + MCP — 2026-04-01

- Kept `apps/api` and `apps/mcp` on pnpm `catalog:` versions and aligned the deploy model around the monorepo root instead of per-app roots
- Added root scripts for API build/start so Railway services can target `api` and `mcp` from the workspace root with explicit per-service commands
- Removed the temporary standalone-app workaround because it broke the repo's single-source-of-truth dependency versioning
- Reason: `catalog:` only resolves when Railway installs with access to `pnpm-workspace.yaml`, so the reliable fix is root-based workspace deploys

## Harden Mobile Clerk + Convex Auth Handshake — 2026-04-01

- Mobile routing now waits for Convex auth readiness, not just Clerk session state — this closes the gap where the app could navigate into authenticated screens before Convex had accepted the token
- User bootstrap no longer swallows `ensureUserExists` failures — failed Convex registration now blocks entry and offers retry instead of silently continuing without a `users` row
- Added Clerk captcha mount to the custom mobile sign-up flow so account creation matches Clerk's required Expo setup
- Reworked the SSO callback to handle incomplete OAuth outcomes explicitly — missing profile fields can now be collected instead of leaving users on a permanent spinner
- Added a signed-in-but-not-Convex-authenticated fallback screen so backend auth misconfiguration fails visibly and recoverably

## Monorepo Dependency Version Management — 2026-04-01

- Added pnpm catalogs to centralize shared dependency versions across all 7 workspaces — single source of truth replaces scattered version strings
- Named catalogs for intentional version splits: tailwind3 (web/mobile), tailwind4 (chrome-extension), zod4 (api), per-runtime @types/node
- Replaced react/react-dom pnpm overrides with catalog declarations — overrides are a blunt resolution hammer, catalogs are a proper version declaration
- Added syncpack (v14) as CI linter to catch version drift — catches anyone bypassing catalog: protocol or introducing mismatches
- Added `lint:deps`, `fix:deps`, `check:expo` root scripts
- Added `.github/workflows/lint-deps.yml` — runs syncpack + expo install --check on PRs touching package files
- Added `packageManager: pnpm@10.15.1` to root package.json for version enforcement
- Aligned drifting versions: convex (chrome-ext 1.33→1.34), @clerk/backend (mcp 2.29→2.30), @tabler/icons-react (web 3.31→3.35), typescript (all →^5.7.0)

## Fix Mobile Auth Flow — 2026-04-01

- Register flow now handles email verification — previously silently failed when Clerk required it (the default)
- Login flow handles `needs_first_factor` status for unverified emails, shows clear error for MFA
- New verify-email screen supports both sign-up and sign-in verification with 6-digit code input + resend
- Added missing `expo-web-browser` dependency (was only available via transitive dep)
- Clerk publishable key now fails fast at startup instead of silently creating broken instance
- Replaced manual SecureStore token cache with `@clerk/clerk-expo/token-cache`
- Simplified SSO callback — removed eager redirect, lets route guard handle navigation

## Obsidian Graph Physics Overhaul — 2026-03-27

- Rewrote physics constants to match Obsidian's floaty, organic feel — much weaker center gravity (0.004→0.0008), higher damping (0.88→0.95), stronger repulsion (3000→5000), higher max speed (1.5→5)
- Nodes now glide and settle smoothly instead of snapping or bouncing
- Wider initial spread (ringRadius 150→250, springLength 140→180) so graph breathes more
- Labels now appear at lower zoom threshold (2.5→1.5) like Obsidian
- Slightly smaller, more uniform node sizing (max 8→6) for cleaner look
- Gravity slider now goes lower (min 0.05) to allow the near-zero gravity Obsidian uses
- Disabled linLogMode in ForceAtlas2 for more natural node repulsion distribution

## Extension Dedup + Smart Tags + Auto-Linking — 2026-03-21

- Added URL-based memory deduplication — API returns 409 when saving a page that already exists, extension shows "Already saved — update?" confirmation
- URL normalization strips tracking params, hash fragments, trailing slashes before comparison
- LLM-powered enrichment replaces hostname-only tags with 3-5 semantic topic tags via OpenRouter (google/gemini-2.0-flash)
- Same LLM call identifies related memories from user's recent 30 for auto-linking via RELATES_TO edges
- Enrichment runs async after create/update — memory saves instantly, tags arrive shortly after
- Bulk imports (bookmarks/history) silently skip duplicates instead of prompting per-item
- New files: `apps/api/src/lib/url.ts` (normalization), `apps/api/src/services/memory-enrichment.ts` (LLM enrichment)

## Graph Response Caching — 2026-03-21

- Added 30s in-memory server-side cache per user on `/v1/graph` — first load hits Neo4j, subsequent loads within 30s skip the query entirely
- Added `staleTime: 30_000` to TanStack Query on the frontend — navigating away and back reuses cached data without refetching
- Added timing logs to graph endpoint — logs Neo4j query duration + node/edge counts to isolate network latency from query time

## Obsidian-Style Graph Overhaul — 2026-03-21

- Redesigned DEFAULT_DARK theme to match Obsidian's knowledge graph aesthetic — near-black background, ultra-thin low-opacity edges, subtle tight glow, dramatic hover dimming
- Tuned physics for calmer, more settled feel — tighter spring length (200→140), stronger springs, higher center gravity, lower max speed, faster damping
- Reduced node size range (max 12→8) and desaturated colors (HSL 65/65→50/72) for soft pastel dot appearance
- Unified edge rendering — removed dashed line distinction for relates_to edges, all edges now solid
- Raised label zoom threshold (1.8→2.5) so labels only appear when zoomed in close
- Lowered default repulsion (5000→3000) and damping (0.92→0.88) for tighter, calmer clusters

## Dedicated Graph Endpoint — 2026-03-21

- Added `GET /v1/graph` endpoint that returns both nodes and relationships in a single Neo4j query — eliminates the waterfall where frontend had to fetch memories first, then relationships second
- Graph endpoint returns only the fields the graph needs (id, title, content preview, tags, createdAt) instead of full memory objects — cuts payload size significantly for 650+ memories
- Single Cypher query fetches Memory nodes with tags via OPTIONAL MATCH, then RELATES_TO edges, returning both in one response — no count query needed since graph doesn't paginate
- MemoryGraph component now uses its own TanStack query to `/v1/graph` instead of depending on MemoryContext (which fetches full objects for the list view)
- Reverted Promise.all on single Neo4j session (caused 500 errors) — sessions don't support concurrent queries

## Graph Performance Optimization — 2026-03-21

- Fixed graph only showing 20 nodes despite 629 memories — MemoryContext was fetching `/v1/memories` without a limit param, backend defaulted to 20
- Replaced O(n²) tag-matching loop with inverted index approach — builds tag→indices map then iterates per-tag groups, reducing 6M+ string comparisons to proportional-to-actual-shared-tags
- Added spatial grid to physics simulation — repulsion now only computed between nodes in adjacent grid cells instead of all-pairs, cutting per-frame work from ~200k to ~10k distance calculations
- Parallelized Neo4j count + fetch queries with Promise.all, and reordered Cypher to SKIP/LIMIT before OPTIONAL MATCH so tag collection only runs on the result page, not all 629 memories
- Added composite index on (userId, createdAt) for the primary list query sort

## Live Graph + TanStack Query + Convex Event Bus — 2026-03-19

- Made graph view live-updating — new memory nodes fade in, deleted nodes disappear, and relationship edges appear/disappear in real-time across tabs without page refresh
- Added Convex `memoryEvents` table as a lightweight event bus between the Hono API and the frontend — Hono fires events on every memory/relationship CRUD operation, frontend subscribes via Convex live query
- Migrated `MemoryContext` from raw fetch + useState to TanStack Query — gives automatic refetch-on-window-focus, optimistic updates, and cache invalidation when Convex events arrive
- Graph now preserves node positions on incremental updates — existing nodes keep their physics positions when new nodes arrive, instead of rebuilding the entire layout from scratch
- New nodes animate in with an opacity fade (0 → 1 over ~0.5s at 60fps), rendered per-frame in the Canvas loop
- Secured event bus with a shared secret (`CONVEX_EVENT_SECRET`) validated inside the Convex mutation — Hono API passes it on every push
- Removed unused `memories` table from Convex schema (Neo4j is the source of truth for memories)
- Added `convex` dependency to Hono API with `ConvexHttpClient` for server-to-Convex communication

## Graph View Modes — 2026-03-18

- Added 5 switchable view modes for the memory graph: Default, Satellite, Constellation, Blueprint, and Minimal
- Each mode has a distinct visual identity — Satellite renders cities-from-space glow, Constellation emphasizes edges like star maps, Blueprint adds a grid with monochrome nodes, Minimal strips all effects
- Extracted all hardcoded render colors into a `GraphViewTheme` config object so renderGraph is fully data-driven
- View mode persists across page reloads via cookie, same pattern as graph physics settings
- Satellite/Constellation force dark canvas appearance, Blueprint forces light, regardless of system theme

## Timeline / Memory Replay — 2026-03-17

- Added snapshot storage on MemoryEvent nodes — each create, update, and proposal resolution now captures the full memory state (title, content, type, status, confidence, tags) as a JSON snapshot, enabling point-in-time replay
- Added three backend timeline query methods: per-memory history, tag-based topic trail, and fulltext search trail — each returns events with memory context for the frontend
- Built frontend timeline page with two modes: Memory History (side-by-side word-level diffs between snapshots) and Topic Trail (tag/search-based event stream across memories)
- URL-based state management via nuqs — timeline mode, selected memory, tag, and search query are all encoded in the URL for shareability
- Added sidebar nav entry and history button on memory detail panel as entry points

## Memory Graph: Organic Brain-Like Layout — 2026-03-17

- Replaced custom force-directed physics with ForceAtlas2 (graphology) to fix node clumping/overlap — LinLog mode produces natural cluster separation
- Tag-cluster ring layout for initial positions gives the algorithm a better starting topology
- Replaced continuous FA2 ticks (caused directional drift) with gentle sine-wave drift per node — each node floats independently using unique phase offsets for an organic "alive" feel
- Canvas renderer and all interactions unchanged

## 2026-03-16

### MCP Playground Page

- Added `/playground` page to web dashboard — connects to MCP server via full OAuth PKCE flow from the browser
- Implements complete OAuth dance: metadata discovery → dynamic client registration → PKCE challenge → Clerk sign-in popup → token exchange → MCP connection
- After connecting, lists all available MCP tools. Users can select a tool, fill in parameters via dynamic form, execute it, and see raw JSON results
- Added CORS middleware to MCP server to allow browser requests from the web app
- Added `NEXT_PUBLIC_MCP_URL` env var to web app config
- Why: Can't test MCP via Claude.ai (Teams restriction) or MCP Inspector (Node version mismatch). This provides a first-party testing surface

### Wire MCP Server to vmem API

- Connected MCP server's stub tools to the live Hono API — MCP can now search, retrieve, add, update, and delete memories via Claude.ai/ChatGPT
- Added dual-auth middleware to API: tries Clerk session token first (web dashboard), falls back to MCP JWT verification (MCP server). Both paths extract the same clerkUserId.
- Created typed API client in MCP (`api-client.ts`) that forwards the user's MCP JWT as a Bearer token to the API
- Implemented 5 MCP tools: `memory_search`, `memory_retrieve` (with Context Trace scoring), `memory_add`, `memory_update`, `memory_delete`
- Fixed Railway build for MCP — was using `npm install` in a pnpm monorepo, now uses `pnpm --filter mcp...`
- Added `jsonwebtoken` to API for MCP JWT verification

### Clerk Auth + JWT Middleware — Extension & API

- Added Clerk authentication to Chrome extension popup using `@clerk/chrome-extension` — users sign in via modal, no more manual API key or user ID entry
- Added Convex integration to extension via `ConvexProviderWithClerk` — runs `ensureUserExists` on login, same flow as web dashboard
- Background service worker uses `createClerkClient({ background: true })` to get fresh session tokens for API calls without popup being open
- Created Hono JWT middleware (`apps/api/src/middleware/auth.ts`) using `@clerk/backend.verifyToken` — all `/v1/*` routes now require valid Clerk JWT in Authorization header
- Removed `userId` from all API request bodies/query params — server extracts it from JWT `sub` claim (Clerk user ID)
- Updated web dashboard (`MemoryContext`, `Dashboard`) to also send Bearer token with API requests, removing userId from query params
- Settings form simplified to just API URL + sign out; auth is fully automatic

## 2026-03-15

### Mintlify Documentation Scaffold

- Set up Mintlify docs at `apps/docs/` with `docs.json` config and 11 MDX pages
- Four sections: Getting Started (intro + quickstart), API Reference (all 14 endpoints across memories, proposed updates, dashboard), MCP Integration (overview + implicit memory pattern), Concepts (memory types, context trace, proposed updates)
- Content pulled from internal docs and actual API route definitions to keep docs accurate
- Added `pnpm docs` script to root for local preview on port 3001
- Mintlify web editor available via dashboard once GitHub repo is connected

## 2026-03-15

### Chrome Extension — Full Implementation

- Built Chrome extension (MV3) at `apps/chrome-extension/` with all core features: save page, export to vmem (ChatGPT/Claude), use vmem context injection, import bookmarks, import browsing history
- Architecture: background service worker handles all API calls (API key never leaves background scope), popup for settings/quick save/imports, content scripts injected into ChatGPT + Claude for export/use vmem buttons
- Export flow uses MCP — extension injects a prompt into the LLM's input telling it to save the conversation via vmem MCP tools (no direct API call for export)
- "Use vmem" retrieves memories from the API and prepends them as context above the user's message in the textarea
- Build: Vite multi-entry with separate builds (popup=React+Tailwind, background=ES module, content scripts=IIFE) — no CRXJS due to MV3 service worker flakiness
- Content scripts handle React-controlled textareas (ChatGPT) and contenteditable divs (Claude) with native setter dispatch for state updates
- All DOM selectors isolated in per-site `selectors.ts` files for easy maintenance when sites update their DOM

## 2026-03-11

### Rewrite Memory Graph with Graphology + Sigma.js (WebGL)

- Replaced hand-rolled Canvas 2D force simulation (603 lines, O(n²) per frame) with Graphology for graph data + Sigma.js for WebGL rendering
- Old implementation had manual force simulation running on every requestAnimationFrame, manual pan/zoom/hit-testing — wouldn't scale past ~100 nodes
- New implementation: Graphology builds typed graph model, ForceAtlas2 computes layout once (50 iterations synchronously), Sigma handles all rendering via WebGL
- Extracted into 4 files: `MemoryGraph.tsx` (orchestrator, ~150 lines), `GraphRenderer.tsx` (Sigma mount + camera controls), `GraphNodeTooltip.tsx` (hover overlay), `GraphNodeDetailDialog.tsx` (click detail dialog), `graph-types.ts` (shared types)
- Node sizing is now degree-based (5 + degree \* 2), node color is hashed from first tag
- Should handle 1000+ nodes smoothly vs old ~100 node ceiling
- Added deps: graphology, sigma, graphology-layout-forceatlas2, graphology-types

## 2026-03-10

### Replace Drizzle/Neon with Neo4j as Memory Store

- Removed Drizzle ORM, Neon serverless driver, and all Postgres schema/config from `apps/api`
- Added Neo4j driver (`neo4j-driver`) as the primary memory database — memories are nodes, relationships are edges, which matches the product model directly
- Neo4j chosen over Postgres because the core data model is a graph (memories, tags, sources, relationships, contradictions) — forcing this into relational tables would fight the data model
- Postgres + pgvector will be added later only if file embedding search outgrows Neo4j's built-in vector index

### Memory Engine Core (Hono + Neo4j)

- Created `apps/api` with Hono on Node.js (via `@hono/node-server`) — lightweight HTTP framework, will add MCP transport later on the same server
- Built `MemoryService` class (`src/db/memory-service.ts`) with full CRUD + smart retrieval:
  - Create/get/list/update/delete memories with tag and source relationships
  - Full-text search via Neo4j fulltext index
  - **Retrieve with Context Trace** — the core differentiator: every retrieval returns a score breakdown (fulltext relevance, recency, confidence) and a human-readable reason for why each memory matched
  - Audit trail: every create/update logs a `MemoryEvent` node linked to the memory
  - Proposed updates: conflict detection with pending/approved/rejected workflow
- Auto-creates Neo4j constraints (unique Memory.id, Tag.name, Source.name, ProposedUpdate.id) and indexes (userId, type, status, fulltext on content) on server startup
- REST API with Zod v4 validation across all 11 endpoints
- Documented MCP architecture decision: memory reads should be implicit (MCP Resources injected before inference), not explicit tool calls — differentiates vmem from Mem0/Supermemory's tool-only approach

## 2026-02-23

### Port Vibot Glass Design System to Vmem

- Ported vibot's full glassmorphism design system into vmem to achieve visual consistency across the V codebases
- Added glass CSS custom properties (`--glass-bg`, `--glass-bg-soft`, `--glass-border`, `--glass-shadow`, `--glass-highlight`) in OKLCh format with light/dark mode variants
- Added four glass component classes: `.glass-panel` (standard), `.glass-panel-strong` (dialogs/popovers), `.glass-panel-subtle` (tabs), `.glass-interactive` (buttons/nav items) with backdrop-filter blur, inset highlights, and layered shadows
- Added body background radial gradients that create ambient light for the glass effect
- Updated 10 UI components (card, dialog, dropdown-menu, popover, select, hover-card, tooltip, tabs, command, sonner) to use glass classes instead of ad-hoc opacity modifiers
- Updated layout files (MainShell content area, Sidebar active nav items) to use glass classes
- Form elements (input, textarea, select trigger) and buttons intentionally left unchanged — they use distinct styling appropriate for their role

## 2026-02-22

### Persist Theme Preference to Convex Users Table

- Added `theme` field (`"light" | "dark"`, optional) to the `users` table in `packages/backend/convex/schema.ts` so theme is stored per-user in the database
- Created `packages/backend/convex/users.ts` with a `getMe` query (returns full user doc or null for unauthenticated users) and a `setTheme` mutation
- Updated `ThemeContext` to sync the stored theme from Convex on first load (applied once via a `hasSynced` ref to avoid repeated overrides), and to persist any theme change back to Convex — theme preference now survives across sessions and devices

### Migrate Form State from useState to React Hook Form + Zod

- Installed `react-hook-form`, `zod`, `@hookform/resolvers` in `apps/web`
- Created `apps/web/lib/schemas.ts` with shared `memorySchema` and `apiKeySchema` — single source of truth for validation rules
- Migrated `AddMemoryForm.tsx`, `AddMemoryModal.tsx`, `ApiKeyModal.tsx`, `MemoryDetailModal.tsx` from manual `useState` per field to `useForm` with zod resolver
- Removed manual `e.preventDefault()`, manual error state, and manual `isSubmitting` flags — these are now handled by RHF internals (`formState.isSubmitting`, `handleSubmit`, `reset`)
- Tag chip inputs (dynamic `string[]` arrays) are managed via RHF `Controller`; the ephemeral tag text input and suggestion dropdown state remain as regular `useState` since they are transient UI state, not form values
- Audio recording state and modal flow state (`step`, `isEditing`, etc.) kept as `useState` — correct for non-form concerns

### Simplify API Key Encryption to Single File + One Env Var

- Deleted `packages/backend/convex/apiKeysNode.ts` — the `"use node"` split was only needed for Node.js `crypto`; the Convex edge runtime supports Web Crypto API natively
- Rewrote `packages/backend/convex/apiKeys.ts` to inline all crypto logic using `crypto.subtle` (AES-256-GCM encrypt/decrypt, SHA-256 hash) and `crypto.getRandomValues` — no `"use node"` required
- Reduced env vars from three (`API_KEY_ENCRYPTION_KEY_B64`, `API_KEY_HASH_PEPPER`, `API_KEY_INGEST_SECRET`) to one (`ENCRYPTION_KEY`)
- Replaced HMAC-SHA256 with HMAC pepper with plain SHA-256 for key lookup hashing — safe because API keys have 192 bits of entropy
- Removed `recordUsageFromService` public action and its internal counterpart in `apiKeysNode.ts` (no external callers)
- Removed redundant two-hop action chain (`createMy` → `createMyInternal`) — `createMy` now does crypto directly
- Fixed `revokeMy` arg from `v.string()` to `v.id("apiKeys")` to eliminate the unsafe `as` cast in `getOwnedApiKeyById`; updated frontend state type to `ApiKey["id"] | null`
- Added exported `decryptApiKey` utility for future use

### Add On-Demand API Key Reveal + Copy to Clipboard

- Added `revealMy` auth action and `getEncryptedKeyInternal` internal query — decrypt only on explicit user request (view/copy buttons), never in list view
- Updated `apps/web/app/(main)/api/keys/page.tsx`:
  - Display always shows generic `vmem_sk_••••••••••••••••` placeholder — no real characters exposed by default
  - Eye icon reveals the full key in-place (stored in component state `revealedKeys`, hidden with eye-off icon)
  - Copy button decrypts on backend and copies to clipboard without displaying — independent of reveal state
  - Both buttons have separate loading spinners (`revealingKeyId`, `copyingKeyId`)
- Removed unsafe `as` assertion from `apps/web/app/(main)/api/logs/page.tsx` — TypeScript narrows type after undefined check

## 2026-02-14

### Hybrid Memory Engine Foundation (Fastify + Postgres/pgvector)

- Added new `apps/api` service with:
  - Fastify server bootstrap (`apps/api/src/index.ts`)
  - DB connectivity and migrations runner (`apps/api/src/db.ts`, `apps/api/src/migrations.ts`, `apps/api/src/migrate.ts`)
  - SQL schema migration for memories, tags, embeddings, chat messages, API keys, and ingestion jobs (`apps/api/migrations/0001_init.sql`)
  - Core endpoints:
    - `GET /health`, `GET /ready`
    - `GET/POST /v1/memories`
    - `GET/PUT/DELETE /v1/memories/:id`
    - `GET/PUT/DELETE /v1/memories/tags`
    - `POST /v1/memories/search`
    - `POST /v1/chat` (SSE)
    - `GET/POST /v1/keys`, `DELETE /v1/keys/:id`
- Implemented API key hashing and auth support in memory engine (`apps/api/src/auth.ts`)
- Added OpenRouter-backed LLM and embedding integration with fallback behavior (`apps/api/src/lib/llm.ts`)
- Added deterministic lexical fallback search and vector-first retrieval (`apps/api/src/lib/memory.ts`, `apps/api/src/lib/relevance.ts`)

### Web API Proxy Migration (Feature-Flagged)

- Added route-level web API auth helper (`apps/web/lib/api-auth.ts`)
- Added memory-engine proxy utility with per-feature flags (`apps/web/lib/memory-engine-proxy.ts`)
- Updated core web API routes to support authenticated proxying while preserving existing mock fallback behavior:
  - `apps/web/app/api/memories/route.ts`
  - `apps/web/app/api/memories/[id]/route.ts`
  - `apps/web/app/api/memories/tags/route.ts`
  - `apps/web/app/api/memories/search/route.ts`
  - `apps/web/app/api/chat/route.ts`
  - `apps/web/app/api/key/route.ts`
  - `apps/web/app/api/key/[id]/route.ts`
- Hardened auth middleware so `/api/*` is no longer public (`apps/web/proxy.ts`)

### Shared Types + MCP Package

- Added shared contracts package `@vmem/types` (`packages/types`)
- Added MCP package scaffold `@vmem/mcp` with memory tool handlers (`packages/mcp/src/index.ts`)

### Docs, Contracts, and Infra

- Added framework decision ADR (`internal/adr/0001-framework-selection.md`)
- Added frozen web API contracts (`internal/contracts/api-contracts.md`)
- Updated planning/docs to reflect active hybrid architecture:
  - `README.md`
  - `CLAUDE.md`
  - `internal/plan.md`
- Added local Postgres/pgvector `docker-compose.yml`
- Added env examples for new API and web proxy flags:
  - `apps/api/.env.example`
  - `apps/web/.env.example`
- Added root scripts for API and MCP workflows (`package.json`)

### Baseline Cleanup

- Fixed lint blockers in key frontend files:
  - Render-purity fix in `apps/web/components/TagCloud.tsx`
  - React compiler rule suppression for Convex provider hook wiring in `apps/web/components/providers/ClientProvider.tsx`
  - Removed unused parameters/state in `apps/web/components/Chat.tsx` and `apps/web/components/MemoryGraph.tsx`
  - Restored `description` usage in `apps/web/components/PageContainer.tsx`
- Connected `apps/web/components/AddMemoryModal.tsx` to real `/api/memories` POST flow (mock/proxy compatible)

## 2026-02-13

### Add AI Elements to @vmem/ui + Rewrite Chat Page

- Created `packages/ui/src/ai-elements/` with 6 components: Conversation (auto-scroll via use-stick-to-bottom), Message (Streamdown markdown rendering), PromptInput (textarea + submit with InputGroup), Reasoning (collapsible thinking with shimmer), Shimmer (motion/react text animation), CodeBlock (code display with copy button)
- Added 5 new base UI components: Collapsible, Popover, HoverCard, Command (cmdk), InputGroup (compound component with addon/button/textarea)
- Added `./ai` export path to `@vmem/ui` package for ai-elements
- Rewrote `Chat.tsx` to use ai-elements: Conversation for auto-scroll, Message/MessageContent/MessageResponse for display, PromptInput for input with status-aware submit/stop button, copy-to-clipboard on assistant messages
- Installed new dependencies: ai, streamdown + plugins (code, cjk, math, mermaid), use-stick-to-bottom, motion, cmdk, nanoid, @radix-ui/react-collapsible, @radix-ui/react-hover-card, @radix-ui/react-use-controllable-state
- Zero TypeScript errors

### Replace HeroUI with @vmem/ui (shadcn/Radix) — Full Migration

- Created `packages/ui/` shared component library with 18 shadcn-style components (Button, Input, Textarea, Dialog, Table, Tabs, Badge, Select, DropdownMenu, Progress, Switch, Separator, Spinner, Skeleton, Card, Label, Tooltip, Checkbox) + Sonner toast wrapper
- All components follow the Conductor pattern: Radix UI primitives + CVA variants + `cn()` utility + `forwardRef`
- Replaced HeroUI theme system with OKLCH CSS variables (Nova neutral palette) in `globals.css`
- Created `lib/tailwind-theme.ts` with semantic color tokens (primary, secondary, muted, accent, destructive, success, warning)
- Rewrote `tailwind.config.ts` — removed HeroUI plugin, added CSS variable theme extension
- Rewrote `ClientProvider.tsx` — removed HeroUIProvider/ToastProvider, added Sonner Toaster
- Migrated all 23 component/page files from HeroUI to @vmem/ui imports
- Key API changes across all files: `onPress` → `onClick`, `isDisabled` → `disabled`, `Modal` → `Dialog`, `Chip` → `Badge`, `addToast` → `toast()`, `useDisclosure` → `useState`, `Divider` → `Separator`, `Switch.isSelected` → `checked`, `Table.TableColumn` → `TableHead`
- Removed `@heroui/react`, `@react-types/shared` dependencies
- Added Radix UI, CVA, clsx, sonner dependencies
- Zero TypeScript errors after migration

### Notifications, Files & Connectors Pages Migration from HeroUI to @vmem/ui (shadcn)

- Migrated `notifications/page.tsx`: Replaced HeroUI Dropdown/DropdownTrigger/DropdownMenu/DropdownItem with Radix DropdownMenu/DropdownMenuTrigger/DropdownMenuContent/DropdownMenuItem, replaced onAction key-based dispatch with individual onClick handlers, migrated Button props (onPress to onClick, isIconOnly+variant="light" to variant="ghost"+size="icon-sm", variant="flat" to variant="secondary")
- Migrated `files/page.tsx`: Replaced HeroUI Table/TableColumn with shadcn Table/TableHead, replaced HeroUI Dropdown with Radix DropdownMenu pattern, replaced addToast with toast from sonner, replaced HeroUI Progress classNames with shadcn Progress className, migrated Button props (onPress to onClick, isDisabled to disabled, startContent to inline children)
- Migrated `connectors/page.tsx`: Replaced Card/CardBody with Card/CardContent, replaced HeroUI classNames prop with className, migrated Button props (onPress to onClick, variant="bordered" to variant="outline", variant="light" to variant="ghost", startContent to inline children)

### AddMemoryForm Migration from HeroUI to @vmem/ui (shadcn)

- Replaced all HeroUI imports (Input, Textarea, Button, Chip, addToast, Progress) with @vmem/ui equivalents (Input, Textarea, Button, Badge) and sonner toast
- Migrated Button props: onPress to onClick, isDisabled to disabled, variant="flat" to variant="secondary"
- Converted Input/Textarea from onValueChange to standard onChange with e.target.value, isDisabled to disabled, removed classNames in favor of className
- Replaced Chip with Badge + inline IconX close button for tag removal
- Replaced HeroUI indeterminate Progress with a plain CSS-animated div for recording indicator
- Replaced addToast({title, description, color}) with toast/toast.success/toast.error from sonner

### MemoryDetailModal Migration from HeroUI to @vmem/ui (shadcn)

- Replaced all HeroUI imports (Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Chip, addToast) with @vmem/ui equivalents (Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Textarea, Badge) and sonner toast
- Converted both Modal instances (detail + delete confirmation) to Radix Dialog pattern (open/onOpenChange)
- Migrated Button props: onPress to onClick, isDisabled to disabled, isIconOnly+variant="light" to variant="ghost"+size="icon-sm", color="danger" to variant="destructive", startContent to inline children
- Replaced Chip with Badge using variant="outline" for tags (both view and edit modes)
- Replaced addToast({title, description, color}) with toast.success/toast.error from sonner
- Converted Input/Textarea from onValueChange to standard onChange with e.target.value
- Added DialogTitle inside DialogHeader for accessibility compliance on both dialogs

### MemoryGraph Migration from HeroUI to @vmem/ui (shadcn)

- Migrated `MemoryGraph.tsx`: Replaced HeroUI imports (Modal, ModalContent, ModalHeader, ModalBody, Chip, Button) with @vmem/ui equivalents (Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Button)
- Converted Modal pattern (isOpen/onClose) to Radix Dialog pattern (open/onOpenChange)
- Migrated Button props: onPress to onClick, isIconOnly+variant="flat"+size="sm" to size="icon-sm"+variant="secondary", removed separate close button in modal header (DialogContent has built-in close)
- Replaced Chip with Badge using variant="outline" and className for custom styling
- Removed unused IconX import

### Memories Layout & Tags Page Migration from HeroUI to @vmem/ui (shadcn)

- Migrated `memories/layout.tsx`: Replaced HeroUI Tabs/Tab with Radix-based Tabs/TabsList/TabsTrigger from @vmem/ui, mapped selectedKey/onSelectionChange to value/onValueChange
- Migrated `memories/tags/page.tsx`: Replaced HeroUI Table (TableColumn to TableHead), Button (onPress to onClick, isDisabled to disabled, isIconOnly to variant="ghost" size="icon-sm"), Input (onValueChange to onChange, isDisabled to disabled), Modal to Dialog pattern (open/onOpenChange), and addToast to sonner toast

### FileUploadModal Migration from HeroUI to @vmem/ui (shadcn)

- Replaced all HeroUI imports (Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Progress, addToast) with @vmem/ui equivalents (Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Progress) and sonner toast
- Converted Modal open/close pattern (isOpen/onClose) to Radix Dialog pattern (open/onOpenChange) with onInteractOutside/onEscapeKeyDown for upload-in-progress protection
- Migrated Button props: onPress to onClick, isDisabled to disabled, isIconOnly to size="icon-sm", variant="light" to variant="ghost", removed startContent in favor of inline children
- Replaced HeroUI Progress classNames API with shadcn Progress className string
- Added DialogTitle inside DialogHeader for accessibility compliance

## 2025-12-04

### API Route Restructure

- Consolidated `/api-keys` and `/api-logs` into `/api` route with nested structure
- Created `/api/layout.tsx` with HeroUI Tabs component for switching between Keys and Logs
- Moved API Keys page to `/api/keys/page.tsx`
- Moved API Logs page to `/api/logs/page.tsx`
- Updated Sidebar to show single "API" link instead of separate entries
- Sidebar now properly highlights "API" when on any `/api/*` route

### Memories Route Restructure

- Created `/memories/layout.tsx` with HeroUI Tabs for List and Graph views
- Updated `/memories/list/page.tsx` to remove PageContainer wrapper
- Added placeholder for `/memories/graph/page.tsx`
- Sidebar now links to `/memories/list`

## 2025-12-03

### Files & Connectors Pages

- Added `/files` route for file management
  - Storage usage progress bar showing used/total space
  - Upload file button (UI only)
  - File list table with icons for different file types (PDF, images, docs, excel)
  - Uses `IconFiles` in sidebar
- Added `/connectors` route for external app integrations
  - Grid of connector cards (Google Drive, OneDrive, Dropbox, Notion, Slack, GitHub)
  - Connected/Disconnect state for each connector
  - Request section for new connector suggestions
  - Uses `IconPlugConnected` in sidebar
- Updated sidebar with new navigation group for Files and Connectors

### Icon Consistency - Tabler Icons

- Replaced all inline SVGs with Tabler Icons for consistency
- Files updated:
  - `chat/page.tsx` - Chat bubble → `IconMessage`
  - `notifications/page.tsx` - Status icons → `IconCheck`, `IconAlertTriangle`, `IconAlertCircle`, `IconInfoCircle`
  - `api-keys/page.tsx` - Lightning bolt → `IconBolt`
  - `AddMemoryForm.tsx` - Close/X button → `IconX`
  - `MemorySearch.tsx` - Search icon → `IconSearch`
- All icons now use consistent stroke width via `stroke={1.5}` prop

### Mobile Header Navigation

- Replaced floating hamburger button with a fixed top header on mobile
- Header contains "vmem" title and sidebar toggle button
- Sidebar now slides in from below the header on mobile
- Main content area adjusted to account for header height

### Floating Panel Layout

- Implemented "floating panel" / "app shell" design pattern
- Shell background: `neutral-200` (light) / `black` (dark)
- Main content: Rounded white/neutral-900 card that floats with margin
- Sidebar now blends seamlessly into the shell (no border)
- Creates a cohesive, modern app-like feel

## 2025-12-02

### Theme System

- Added light/dark mode support with toggle in sidebar
- Light mode is now default (white bg, black text)
- Dark mode uses `dark:` prefix classes (black bg, white text)
- Theme persisted to localStorage
- Script in layout.tsx prevents flash on page load

### Responsive Simplification

- Removed all `lg:` breakpoint classes
- Now using only base (mobile) + `md:` (desktop) breakpoints
- Sidebar: 280px on mobile, 20% width on desktop

### Routing Refactor

- Migrated from single-page tab navigation to file-based App Router routes
- Created `(main)` route group with shared layout containing Sidebar
- Each tab is now a separate page.tsx under its own route folder
- Root `/` now redirects to `/dashboard`

### Server Component Optimization

- Page components are now server components by default
- Extracted interactive parts into dedicated client components:
  - `MemorySearch.tsx` - handles search state and filtering
  - `AddMemoryForm.tsx` - handles form state and tag input
  - `SettingsToggles.tsx` - handles toggle state
- `Sidebar.tsx` uses `usePathname` for active route detection

### Initial UI Implementation

- Built complete vMemory frontend UI with black & white minimal theme
- Created fixed left sidebar navigation (20% width on desktop)
- Implemented 5 pages:
  - **Dashboard**: Stats cards, recent memories, quick actions
  - **Memories**: Searchable table with title, tags, created date
  - **Add Memory**: Form with title, content textarea, chip-style tags
  - **API Keys**: Table of keys with MCP integration card
  - **Settings**: Toggle preferences, profile card, danger zone
- Added responsive design (mobile hamburger menu, adaptive layouts)
- Configured Inter font via Google Fonts

### Infrastructure

- Enabled Turbopack for dev and build commands in frontend
- Added root package.json scripts to proxy commands to frontend directory
- Created ai-guidance folder with project documentation
