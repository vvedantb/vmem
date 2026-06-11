FOLLOW ALL OF THESE RULES

Implementation:

- Always read the CLAUDE.md file (if it exists) first to understand the codebase's specific rules
- Assume the project is greenfield - breaking changes are fine
- If you are implementing from a plan, then you are allowed to just go ahead and implement - this is because the plan had already been carefully crafted so you don't need to spend time thinking about it - just go ahead and do as the plan says.
- Have a deep think of the best solution, do not just jump into implementation
- I want you to consider the simplest solution first, another engineer is likely to read it so it should be simple and easy to understand, and not overly bloated with features that they will need to maintain.
- When unsure, ask for clarification before implementing.
- If requirements are ambiguous, ask clarifying questions before implementing.
- Feel free to ask AS MANY QUESTIONS AS YOU LIKE, you must have a complete end to end understand of how the user wants something to be implemented, even if the user may not know themselves.
- Prefer making a detailed plan over a quick plan
- Add comments especially for big functions and update comments (if needed) when modifying big functions- When done implementing, explain all your changes made to the user
- When done implementing, explain all your changes made to the user
- If you have learnt anything new from the user, ie their preference of implementing something, then include this in the CLAUDE.md too in a short concise format
- Never use `any`
- Never use `unknown`
- Never use `as` for type assertions
- Never use the non-null assertion operator `!`.
- Always use top-level `import` / `import type` at the file top — never dynamic `import()`, never inline `import("…")` type expressions, never `await import()` inside functions.
- If a type is difficult to express, rethink the design instead of bypassing the type system.
- Prefer simplicity over cleverness.
- Minimize surface area of change.
- Co-locate logic where it naturally belongs.
- Avoid premature abstractions.
- Prefer explicit over magical behaviour.
- All decisions should optimize for long-term maintainability.
- Do not run any dev / lint / build commands unless the user asks you to

Convex:

- Never manually define interfaces for Convex documents.
- Always import:
  - `Doc<"tableName">`
  - `Id<"fieldName">`
  - `FunctionReturnType<typeof api.functionName>`
- Convex types are the single source of truth.
- If the schema changes, all consumers must update automatically.
- Never duplicate schema types manually.
- To typecheck Convex: `cd packages/backend && npx convex codegen --typecheck enable` (no dev server needed)
- **`pnpm convex`** = Convex **dev** server (`npx convex dev` → dev deployment). When the user says "run convex" / `pnpm convex`, use this — **not** deploy.
- **`pnpm convex:deploy`** = prod deploy — only when the user explicitly asks to deploy.
- Schema migration chicken-egg problem: When changing a field type with existing data, use v.union(oldType, newType) temporarily → deploy → run migration → change to only newType
- Single source of truth for table fields: Define table fields as exported `const xxxFields = { ... }` in `validators.ts`. Use in both `schema.ts` (`defineTable(xxxFields)`) and return validators (`v.object({ _id: v.id("table"), _creationTime: v.number(), ...xxxFields })`). Never duplicate field definitions between schema and return validators.
- Do not mirror Convex query data into `useState` for form inputs. Convex queries are live/reactive — bind the input's `value` directly to the query result and call the mutation directly in `onChange`. If the input needs instant feedback without waiting for a server round-trip (e.g. textareas, fast-typing fields), attach `.withOptimisticUpdate` to the mutation to patch the local query cache. No local state, no hydration `useEffect`, no debounce draft copy.
- Backend layout (Eva-aligned): `convex/` = registered functions + orchestration + `convex/prompts/` + `convex/cloudLib/` (Convex-coupled chat tools). `engine/` = Neo4j/codebase/parsers outside `convex/` (like Eva's `callback-src/`) — imported only from `"use node"` actions. `neo4j-cli/` = seed/eval/unseed scripts. `tests/` = unit tests importing from `engine/` or `convex/` (Eva puts tests at package root, not inside `convex/`). Memory actions: thin `neo4jActions/memories.ts` facade → `neo4jActions/_memories/` (handlers + `actions.ts`). From `convex/`, import narrow `engine/neo4j/memory/*` modules directly.
- Client package imports: apps import only `@vmem/backend` (Convex `api` + `Doc`/`Id` types) and `@vmem/shared` (cross-app constants + client-safe prompt helpers like `PARSER_VERSION`, `buildSkillsIndexAddition`). Never `@vmem/backend/*` subpaths. `@vmem/backend` root must stay Convex-only — no constants or prompts re-exported.

TypeScript performance (typecheck must stay in seconds — warm ~0.7s, cold ~12s web / ~3s backend):

- Never import the monolithic `googleapis` package — its root types pull all ~400 Google APIs (~830 d.ts files, 115 MB) into every typecheck that touches the Convex api graph (web included). Use scoped `@googleapis/<api>` packages (`@googleapis/gmail`, `@googleapis/drive`).
- Never call the AI SDK's `zodSchema()` on a concrete `z.object` schema — type-checking one call costs ~5-20s in tsgo (TS2589 territory), and `@ts-expect-error` does NOT avoid the cost (the checker still does the work before discarding the error). Use `jsonSchema<Params>(zodToJsonSchema(schema, { $refStrategy: "none" }))` and re-`parse` inside `execute` (see `convex/cloudLib/openRouterTools.ts`).
- Both tsgo configs are incremental (`node_modules/.cache/tsgo/*.tsbuildinfo`); never remove that, it's what keeps warm runs sub-second locally and on Vercel.
- To find typecheck hotspots: `npx tsc -p tsconfig.json --noEmit --generateTrace <dir>` then `npx @typescript/analyze-trace <dir>`; iterate on a single hot file via a throwaway tsconfig that `extends` the real one with `"include": [<that file>]`.

Neo4j:

- Never run parallel `session.run()` calls on the same session — use separate sessions for concurrent queries
- Cypher integer params (`LIMIT`, `SKIP`, hop depth, etc.) must use `neo4j.int()` after `Math.trunc` — MCP/JSON/Convex hops can pass floats like `25.0` and Neo4j rejects them. Use `clampNeo4jLimit()` / `toNeo4jIntParam()` from `packages/backend/engine/neo4j/intParams.ts` (see `tests/neo4j/intParams.test.ts`)
- Indexes/constraints auto-provision on first codebase sync via `ensureNeo4jSetupIfNeeded` (checks `code_symbol_search` index). Manual full re-run after new indexes ship: `npx convex run internal.neo4jActions.dbSetup.ensureNeo4jSetup`

Codebases:

- Global daily sync: `convex/crons.ts` → `codebaseSync.dailyCodebaseSyncWorkflow` via `@convex-dev/workflow` (one `syncOneCodebaseInternal` step per repo, full action timeout each). Stale = `lastSyncedAt` older than 24h; skips `syncing` and users without GitHub.

Chrome extension auto-sync (`apps/chrome-extension/src/background/sync-scheduler.ts`):

- MV3 reliability uses **mutual-watchdog alarms**: the slow history alarm (30 min) and the frequent heartbeat alarm (`SETTINGS_MIRROR_ALARM_NAME`, 5 min) each re-assert the other on every fire (`ensureSettingsMirrorAlarm` / `startAutoSync`, both idempotent — only create when absent so timers never reset). As long as either alarm survives, both come back. Chrome silently drops periodic alarms (OS sleep/hibernate on Windows, SW crash, extension update) — never rely on a single alarm.
- The heartbeat is the self-heal path: it re-creates the history alarm and runs `catchUpHistorySyncIfOverdue()`, so a dropped alarm or missed sync recovers within ~5 min instead of waiting for `onStartup`. Don't reduce its handler back to "just refresh settings."
- Every sync attempt records `lastSyncAttemptAt` + `lastSyncSkipReason` (`recordSyncAttempt`) into storage and the debug report — a silent gap (lost auth, dropped alarm) must stay diagnosable, never look healthy. No-session skips are expected after a browser restart (`chrome.storage.session` token cleared) and recover via the cookie listener / popup TokenSync / heartbeat retry.
- **Popup UI must never block on the popup's Convex websocket** — `useQuery` can stall in the short-lived popup while the background HTTP client works fine (this once left the theme select permanently `disabled`). Settings that drive popup UI are mirrored to `chrome.storage` (`useExtensionUserSettings` mirror effect) and read from there (`useTheme`); Convex mutations fire best-effort for cross-device sync. Hook instances stay in sync via `chrome.storage.onChanged`.
- **YouTube transcript extraction is DOM-based** (`src/content/youtube/index.ts`): it clicks the page's own "Show transcript" button, scrapes `transcript-segment-view-model` (new) / `ytd-transcript-segment-renderer` (old) segments, then closes the panel. Never reintroduce network-based caption fetching — `timedtext` 200s with an empty body and InnerTube `get_transcript`/`get_panel` reject JSON replays unless the request carries a per-video BotGuard proof-of-origin token only the page's player can mint. Live E2E check: `pnpm test:live:yt` (headless Edge, real watch page, asserts the SAVE_YOUTUBE_VIDEO payload contains a real transcript).

Mobile app (`apps/mobile`, Expo 56 / expo-router drawer):

- **Chat mirrors web's 3-hook shape**: `useLocalChat` (GGUF via `@react-native-ai/llama`, `<think>` parsing via shared `parseThinkTags`, usage + trace-bearing memory refs) + `useCloudChat` (OpenRouter via `api.chat.initiateStreaming`; deltas arrive through the same `useUIMessages({stream:true})` — no extra transport) + `useChatProvider` orchestrator. Offline forces the local provider.
- Provider/cloud-model prefs live in SecureStore (`chat-prefs.ts`, keys `vmemChatProvider`/`vmemCloudModelId`) — same pattern as `vmemActiveModelId`.
- `src/lib/memory-grounding.ts` `buildGroundedPrompt` is the single retrieve→refs→system-prompt path shared by chat (VMEM_LOCAL_CHAT_CORE) and voice (VMEM_VOICE_CORE). Types derive from `FunctionReturnType` (e.g. `ChatMemoryRef` from `getThreadMessageMemoryRefs`) — no hand-written Convex shapes.
- Web hover interactions become tap → `BottomSheet` (memory trace, usage, model selectors); dialogs use `AppModal`. Skills `/` picker = TextInput `selection` tracking + overlay INSIDE KeyboardAvoidingView (a Modal would dismiss the keyboard); inserted skills stay plain `/name` text (matches `findSkillsReferencedInMessage`), with an accent-pill preview row via shared `segmentInputBySkills`.
- Voice (`record.tsx` + `useVoiceSession`): OS STT (`expo-speech-recognition`, promise-gate the final result after `stop()` — `end` can fire late or never; 3s fallback) → grounded local-LLM reply → persist (`saveLocalMessages` source `vmem-local-voice`, BEFORE TTS so cancel never loses the turn) → `expo-speech` TTS (chunk on `Speech.maxSpeechInputLength`). llama generation can't abort — cancellation is `cancelledRef` checks after each await. `PersonaOrb` ports web's persona keyframes verbatim via reanimated + react-native-svg gradients (no CSS blur on native — wide radial falloff approximates it).
- Settings is a stack dir (`app/(main)/settings/`: hub index → models/preferences/profiles/secrets) — drawer route name `settings` unchanged. Preferences binds inputs to `api.userSettings.get` + `.withOptimisticUpdate` (no useState mirrors).
- Theme tokens in `src/global.css` mirror web's `globals.css` (oklch→hsl); mobile dark is neutral grey (no purple tint) since the parity port. Screens use `bg-surface` (web's content panel); the drawer keeps `bg-background` (web's sidebar). `--accent` = primary action (black light / white dark) — never a subtle hover fill.
- Mobile typecheck: `cd apps/mobile && npx tsc --noEmit`. Known pre-existing failure in `packages/backend/convex/mcp/native.ts` (RN lib types lack `FormData.forEach`).

Memory graph view (`apps/web` canvas + `engine/neo4j/memory/graph.ts`):

- **Local-first**: `/memories/graph` defaults to `scope=local` — the focused memory's 1–3 hop neighbourhood (`?depth=`, QPP quantifier is a clamped literal; Cypher forbids params there). No `?focus=` → server centres on the newest memory and returns `focusNodeId`. `?scope=global` = full graph, paged 500-at-a-time via `nodeLimit` up to the 2000 cap, with server-side `totalMemoryCount` for the "Showing X of Y · Load more" pill.
- **Simulation sleeps**: worker stops its tick interval below `SLEEP_ALPHA` (0.005, defined in both `simulation.ts` and `simulation-worker.ts`); GraphCanvas's rAF loop skips painting unless sim/viewport/interaction/props changed. Don't reintroduce always-on ticking or `.restart()` (d3's internal timer is intentionally stopped — ticking is fully manual). Drags use `alphaTarget(0.3)` → `0`.
- **Force model lives in `canvas/physics-forces.ts`** (shared by worker + main-thread fallback so they can't drift): Obsidian-style — link strength stays at d3's degree-normalized default (a flat `.strength()` crushes leaves into rings around hubs; never reintroduce), link distance scales with endpoint sizes, charge `-scalingRatio*12` with `distanceMax` from the physics profile, weak per-node `forceX/forceY` centering (NOT `forceCenter`, which only translates — it never pulls stray components in), `velocityDecay 0.3`, collide radius `size*2+12`. **`chargeDistanceMax` must exceed the settled disc radius (~sqrt(n)·40)** or the outer shell stops feeling core repulsion and the centering pull slowly collapses the cloud into an overlapping ball (observed at bench=5000 with an 800 cap).
- **Worker MUST be `{ type: "module" }`** (`simulation.ts`): the worker source has ESM imports; a classic worker dies on its first `import` with an ASYNC SyntaxError that the sync try/catch never sees — silently NO physics (layout = golden-spiral seed) and `currentAlpha` pinned at 1, so `positionsMoving` stays true and every frame full-renders forever (no blit, no idle sleep — this was the root cause of all graph jank). `worker.onerror` now falls back to the main-thread sim; every controller method delegates via the `fallback` local.
- **Gesture-priority rendering** (`SETTLE_SNAPSHOT_MS`, 150ms, GraphCanvas): while a pan/zoom gesture runs over a HOT sim (initial settle, post-drag reheat), gesture frames blit the latest world snapshot and re-render it at most every 150ms — settle animation progresses ~7fps, gesture stays at 60fps. Node drags are exempt (need live feedback). Verified at `?bench=5000`: settled zoom/pan/hover all 60fps with 0 frames >33ms; idle = zero canvas calls.
- **Crisp-zoom band** (`cacheSharp`, GraphCanvas): blits are only used while `vp.scale / worldCache.scale` stays in (0.8, 1.25) — outside it the gesture frame re-renders the scene (refreshing the snapshot) so deep zooms never show more than ~25% bitmap blur. Gesture-frame renders are kept cheap by `gestureActive` (param threaded into `renderer.render`): glow pass skipped, tag-edge pass skipped when edges > 1500, both restored on the crisp settle frame. Zoom spring is 0.35 (`SPRING_FACTOR`, viewport.ts) — 0.15 trailed the wheel by ~230ms and read as mushy.
- **Labels never use fillText maxWidth** (renderer.ts `nodeLabel`): the maxWidth overload forces a measure+squish slow path; titles are pre-truncated to 26 chars (cached per node in a WeakMap) and drawn with the fast overload — ellipsis instead of squished glyphs.
- **Layout stability**: GraphCanvas snapshots node positions on sim teardown and re-seeds surviving nodes on the next data swap — load-more/filters/live-edges only animate new nodes in.
- **Smooth pan/zoom (blit cache)**: a full render is 6ms at 500 nodes (15ms spikes) and ~26ms at 2.7k — both miss frames mid-gesture. So pan/zoom-only frames blit the cached world bitmap (one `drawImage`, ~0.02ms regardless of size) and re-render crisp the frame the gesture settles (`lastFrameWasBlit`). Enabled above `BLIT_CACHE_MIN_NODES` (400 — one memory page is 500) in GraphCanvas; below it full renders are cheap and stay pixel-exact. The bitmap goes slightly soft mid-gesture by design (Obsidian does the same). Don't raise the threshold back up — the realistic 500–2.7k range must blit.
- **Label thinning (Obsidian-style)**: the node-label pass is the dominant full-render cost (fillText/measureText per node — more than the rest of the frame at a dense zoom-out, and the source of the worst spikes). renderer.ts only captions a node when `baseRadius * vp.scale >= minLabelScreenR` (6px) so labels fade out as nodes shrink (biggest hubs persist longest) and fade back in on zoom-in; the hovered node always shows its caption, neighbours use a lenient half-threshold (3px) so hovering a hub in a dense area doesn't stack unreadable text. This roughly halved the 2.7k-node render (26ms → 12ms) on top of the existing `!lowZoom && !highNodeCount` gate.
- **Glow budget** (`glowNodeBudget`, 1500, renderer.ts): the glow pass is one `createRadialGradient` + fill per node per frame — at 5k nodes it was ~80% of the frame (23ms vs 4.6ms without). Glow cuts off past 1.5k nodes (halos are overlapping soup there anyway), much earlier than the >5000 label/logo cutoff.
- **Settle paints gated on `positionsVersion`** (SimulationController + GraphCanvas `positionsNeedPaint`): the worker posts positions at ~30Hz while the rAF loop runs at 60 — without the gate, half of all hot-sim frames repainted identical positions (and rebuilt the spatial index over them). Scene paints consume the version only on non-blit frames; drags are exempt (dragged node x/y is set synchronously per mousemove between worker posts, so drag feedback stays 60fps).
- **Stable empty identities in `useGraphData`**: the loading/bench return branches use module-level `EMPTY_*` array constants — inline `[]` minted fresh identities per render, invalidating `buildGraphData`'s memo and re-running GraphCanvas's `[nodes, edges]` effect, which tears down and rebuilds the whole simulation worker.
- MCP `memory_graph` tool: max 100 nodes (naive O(n²) sim in the bundled MCP-UI canvas + tool results land in model context); plain global fetches pass `nodeLimit` to Neo4j instead of slicing 2000.

Profiles:

- Profiles are for **organizing where memories get saved**
- Profile filtering IS allowed in views (list/graph) via URL params, just not as a route-level prefix (e.g., no `/work/memories` vs `/personal/memories`)
- Dashboard stats, sidebar stats, activity feed always show user-wide totals (not filtered by profile)
- Profile filter uses nuqs like other filters (tags, sources, types) — persists to URL for shareability
- Switching profiles in save forms changes which profile new memories are saved to

Skills:

- Push model (Claude-like): enabled skills index (name + description) is injected into MCP `vmem://context_prompt`, local chat, voice, and mobile system prompts via `buildSkillsIndexAddition` in `@vmem/shared` (`packages/shared/src/prompts/memoryRagPrompt.ts`)
- Full instructions are lazy: MCP clients call `skills_get`; local chat loads instructions when the user message mentions a skill by name (`findSkillsReferencedInMessage`)
- Skill CRUD invalidates `contextPromptCache` (same 60s debounce as memory writes)
- `skills_list` MCP tool returns index only (no instructions)
- `skills_create` MCP tool: use when a repeatable problem or automatable workflow was identified and no existing skill covers it (check context prompt / `skills_list` first)
- `skills_update` MCP tool: patch an existing skill by current name (`skills_get` first); at least one of newName, description, instructions, enabled

Files (shared AI filesystem):

- One `fileNodes` table (folders + files, discriminated by `kind`; `fileNodeFields` in `validators.ts`) backs both the `/files` web view and the MCP file tools. Bytes live in Convex storage (`storageId`), same upload-URL flow as memory imports (`generateFileUploadUrl` → POST → `createFile`).
- Web functions in `convex/files.ts` (auth\* + internal-by-clerkId). `listTree` returns every node plus a resolved serving `url` per file in one shot — the web maps `Doc<"fileNodes">` → the `FileItem` view-model in `useFilesData` (keeps presentational components on string ids; resolves them back to branded `Id`s at the mutation boundary, no casts). No REST/`/api/files` — that was mock and is gone.
- MCP tools (`files_list`, `files_get`, `files_upload`, `files_delete`) are **path-based** (`ai-images/cat.png`), user-wide (scoped by clerkId, MCP scope ignored, like wiki). Backend in `convex/mcp/files.ts`; pure path/tree helpers in `convex/files/lib.ts` (`resolveByPath`, `nodePath`, `collectSubtreeIds`, `FILE_STORAGE_LIMIT_BYTES`). Upload auto-creates missing folders and overwrites an existing file at the path (idempotent); accepts `contentBase64` OR `sourceUrl` (server fetches). `files_get` returns an MCP image content block for images ≤4 MB (custom shaping in `tools.ts` `filesGetContent`), text inline ≤100 KB, always a `downloadUrl`. Upload cap 10 MB, storage limit 10 GiB.
- File tools are MCP-only — intentionally not added to the cloud-chat OpenRouter surface (`cloudLib/openRouterTools.ts` opts in per-tool).

MCP Apps (interactive views in Claude / MCP Apps hosts):

- Use `@modelcontextprotocol/ext-apps` + bundled HTML in `packages/backend/mcp-ui/` → `convex/mcp/bundled/`; do **not** adopt Skybridge for embedded Convex tools (see `internal/mcp-apps.md`)
- Dev MCP only: `https://outgoing-reindeer-268.eu-west-1.convex.site/mcp`; `WEB_APP_URL` = `https://vmem-git-staging-vedantb.vercel.app`
- `memory_graph`: `memoryGraphApp.ts`, `mcpGraph.ts`, build via `build:mcp-graph-ui`

Git commits:

- Never add `Co-authored-by: Cursor` or `Made-with: Cursor` to commit messages; `.husky/prepare-commit-msg` strips them if Cursor injects them.

FOLLOW ALL OF THESE RULES

UI Design System — Tonal Surface Hierarchy:

Shadows:

- No shadows on inline elements (cards, buttons, inputs, tabs, alerts, checkboxes).
- Only floating/overlay elements (popovers, tooltips, dropdowns, dialogs, sheets) get shadows — they need depth to show layering over content.
- `shadow-none`/`border-0` on embedded form elements is fine — that's stripping inherited defaults, not adding decoration.

Borders:

- No borders for visual separation between layout regions (sidebar edge, section dividers, header/footer separators). Use background color contrast instead.
- No borders on cards, accordion items, or content containers. Use `bg-surface-secondary/40` or similar tonal shift.
- No borders on active/selected/hover states. Background color change alone indicates state.
- Borders allowed only for: form element affordance (inputs, selects) and structural metaphors (e.g. browser-tab in SandboxTabBar).

Layout & Surface Colors:

- HeroUI tokens in `apps/web/src/globals.css` — see TOKEN GUIDE comment at top of file.
- App shell: `MainShell` → outer `bg-background`, main card `bg-surface`, sidebar `bg-background`.
- Nested blocks on surface: `bg-surface-secondary` or `/40` opacity; hover → `bg-surface-tertiary`.
- `--muted` is secondary **text** only — never a resting row/card background (use surface tokens).
- Sidebar is always the darker surface, main content the lighter surface (both light and dark mode).
- Hierarchy comes from: tonal surface contrast > whitespace > typography weight/size.

Hover & Interaction States:

- Hover: `hover:bg-*` (background shift). Never `hover:border-*` or `hover:shadow-*`.
- Active/selected: `bg-*` + `ring-*` if emphasis needed. Never border.
- Keep transitions to `transition-[transform,background-color]` — no `box-shadow` or `border-color` in transitions.
- **Inline list rows** (memories list, API request log, activity log, etc.): default **flat/transparent** — never a resting surface tint on each row. Background only on `hover:` (and `focus:` / selected when applicable). Pattern: `hover:bg-surface-tertiary/50` (see `ListItemRow`, `LogsTable`, `ApiLogsTable`). Use `bg-surface-secondary/40` on **containers** (summary cards, empty states, panels), not on every item inside a list.

Spacing:

- Use whitespace/padding (Gestalt Law of Proximity) to group related elements, not dividers or `border-t`/`border-b`.
- Section separation = increased margin (`mt-6`), not a line.

Detail Page Headers:

- Detail pages (`$id`, `$teamId`, etc.) use the `breadcrumb` prop on `PageContainer` — never a back button.
- Breadcrumb replaces the `<h1>` title. Pattern: parent route (muted, clickable `BreadcrumbLink asChild` wrapping `Link`) → `/` → current page (`BreadcrumbPage`, foreground, not clickable, same font weight).
- Page meta (status badges, branch names, counts) lives in `centerSection`, not next to the breadcrumb. Actions live in `rightSection`.
- Breadcrumb is desktop-only; mobile topbar shows the page title from `PageTitleContext` (still set via `PageContainer`'s `title` prop).

Header Controls — Filters vs Sort vs View:

- A filter = a control whose intent is to change which items are visible (reduce the set). Sort order and view layout (grid/list) are NOT filters — they only change presentation.
- Consolidate real filters into a single `Filters` dropdown button (with `IconFilter` + count badge). Sort and view stay as their own separate controls.
- Active-filter count on the badge: count each filter field that is currently non-default as 1 (arrays with ≥1 item count as 1, not length). Sort and view never contribute to this count.
- The Filters dropdown's "Reset filters" option (rendered only when count > 0) resets ONLY filter fields — never sort or view.
- Prefer dropdowns with explicit options over toggle buttons when a control has ≥2 states — more discoverable.
- Enumerable multi-select filter tabs (Kind/Type/Source) render **checked-by-default**: stored state keeps empty-array-=-"all" (clean URLs, badge count), but in that default every checkbox renders checked. Unchecking from the all state selects all-but-that-one; re-checking the last missing option (or unchecking the only remaining one) normalizes back to `[]`. Helpers in `apps/web/src/components/_components/UnifiedFilterPanel/checkedByDefault.ts`. Tags is exempt (AND semantics over an unbounded set).

Component Structure:

- Max ~250 lines per client component
- Route-level `*Client.tsx` = thin orchestrator (queries, top-level state, layout composition)
- Route-local child components go in `_components/` folder
- Pure helper functions go in `_utils.ts` at route level
- Inline sub-components defined in the same file should be extracted to `_components/`

Nuqs:

- If you are required to implement filters, or sort by methods, make sure nuqs is installed in the codebase and use it to create searchParams.ts and use the useQueryState/useQueryStates hook from nuqs to implement the filters / sorting methods. This is preferred over local state as it stores the state in the URL so can be shared with other users.

Husky:

- If the codebase uses Nextjs/React, make sure husky is setup with the default prettier configuration to format code before it gets committed.

Icons:

- Get logo SVGs from https://svgl.app

Verification Rules after implementation:

- Ensure no `any`, `unknown`, or `as` exists.
- Run npx tsc in the appropriate codebase and fix any type issues (if related to your changes)
- Ensure types are inferred where possible.
- Ensure no unnecessary client components were introduced.
- Ensure CLAUDE.md is updated if architecture decisions changed and with new learnings.
- Run `/changelog` after medium-large changes or new features to document what changed.

Implementation Process:

- Read CLAUDE.md first (if exists)
- Understand existing architecture before changing anything.
- Identify the simplest possible solution.
- Avoid adding new dependencies unless absolutely necessary.

Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if any.
- Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one
- Use the AskUserQuestion tool

Product scope:

- vmem = memory/context layer only — not Composio (agent tools), AgentMail, Daytona, etc. See `internal/product-scope.md` for decision + connector roadmap audit.
- Connectors = ingest into Neo4j memories, not live app actions. Composio/MCP tool platforms are complementary, not replacements.

Philosophy
This codebase will outlive you. Every shortcut becomes someone else's burden. Every ack compounds into technical debt that slows the whole team down.
ou are not just writing code. You are shaping the future of this project. The atterns you establish will be copied. The corners you cut will be cut again. Fight entropy. Leave the codebase better than you found it.

stop adding usestate's useref's for everything, this is the easy way out for every problem which is bad practice, first think of the best way to do this before resorting to those options

if the user asks you to run a migration, you need to add a migration function to clear the documents with that field in the db, then you run it, then you can get rid of the fields from the schema, then cleanup the migration function

if you are using the agent-browser skill, navigate to `/?agent` to auto sign in as the agent user.
