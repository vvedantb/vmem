# Changelog

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
