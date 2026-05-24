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
- Schema migration chicken-egg problem: When changing a field type with existing data, use v.union(oldType, newType) temporarily → deploy → run migration → change to only newType
- Single source of truth for table fields: Define table fields as exported `const xxxFields = { ... }` in `validators.ts`. Use in both `schema.ts` (`defineTable(xxxFields)`) and return validators (`v.object({ _id: v.id("table"), _creationTime: v.number(), ...xxxFields })`). Never duplicate field definitions between schema and return validators.
- Do not mirror Convex query data into `useState` for form inputs. Convex queries are live/reactive — bind the input's `value` directly to the query result and call the mutation directly in `onChange`. If the input needs instant feedback without waiting for a server round-trip (e.g. textareas, fast-typing fields), attach `.withOptimisticUpdate` to the mutation to patch the local query cache. No local state, no hydration `useEffect`, no debounce draft copy.

Neo4j:

- Never run parallel `session.run()` calls on the same session — use separate sessions for concurrent queries
- Cypher integer params (`LIMIT`, `SKIP`, hop depth, etc.) must use `neo4j.int()` after `Math.trunc` — MCP/JSON/Convex hops can pass floats like `25.0` and Neo4j rejects them. Use `clampNeo4jLimit()` / `toNeo4jIntParam()` from `packages/backend/src/neo4j/intParams.ts` (see `intParams.test.ts`)
- Indexes/constraints auto-provision on first codebase sync via `ensureNeo4jSetupIfNeeded` (checks `code_symbol_search` index). Manual full re-run after new indexes ship: `npx convex run internal.neo4jActions.dbSetup.ensureNeo4jSetup`

Codebases:

- Global daily sync: `convex/crons.ts` → `codebaseSync.dailyCodebaseSyncWorkflow` via `@convex-dev/workflow` (one `syncOneCodebaseInternal` step per repo, full action timeout each). Stale = `lastSyncedAt` older than 24h; skips `syncing` and users without GitHub.

Profiles:

- Profiles are for **organizing where memories get saved**
- Profile filtering IS allowed in views (list/graph) via URL params, just not as a route-level prefix (e.g., no `/work/memories` vs `/personal/memories`)
- Dashboard stats, sidebar stats, activity feed always show user-wide totals (not filtered by profile)
- Profile filter uses nuqs like other filters (tags, sources, types) — persists to URL for shareability
- Switching profiles in save forms changes which profile new memories are saved to

Skills:

- Push model (Claude-like): enabled skills index (name + description) is injected into MCP `vmem://context_prompt`, local chat, voice, and mobile system prompts via `buildSkillsIndexAddition` in `packages/backend/src/memoryRagPrompt.ts`
- Full instructions are lazy: MCP clients call `skills_get`; local chat loads instructions when the user message mentions a skill by name (`findSkillsReferencedInMessage`)
- Skill CRUD invalidates `contextPromptCache` (same 60s debounce as memory writes)
- `skills_list` MCP tool returns index only (no instructions)
- `skills_create` MCP tool: use when a repeatable problem or automatable workflow was identified and no existing skill covers it (check context prompt / `skills_list` first)
- `skills_update` MCP tool: patch an existing skill by current name (`skills_get` first); at least one of newName, description, instructions, enabled

MCP Apps (interactive views in Claude / MCP Apps hosts):

- Use `@modelcontextprotocol/ext-apps` + bundled HTML in `packages/backend/mcp-ui/` → `convex/mcp/bundled/`; do **not** adopt Skybridge for embedded Convex tools (see `internal/mcp-apps.md`)
- Dev MCP only: `https://outgoing-reindeer-268.eu-west-1.convex.site/mcp`; `WEB_APP_URL` = `https://vmem-git-staging-vedantb.vercel.app`
- `memory_graph`: `memoryGraphApp.ts`, `mcpGraph.ts`, build via `build:mcp-graph-ui`

FOLLOW ALL OF THESE RULES

UI Design System — Tonal Surface Hierarchy:

Shadows:

- No shadows on inline elements (cards, buttons, inputs, tabs, alerts, checkboxes).
- Only floating/overlay elements (popovers, tooltips, dropdowns, dialogs, sheets) get shadows — they need depth to show layering over content.
- `shadow-none`/`border-0` on embedded form elements is fine — that's stripping inherited defaults, not adding decoration.

Borders:

- No borders for visual separation between layout regions (sidebar edge, section dividers, header/footer separators). Use background color contrast instead.
- No borders on cards, accordion items, or content containers. Use `bg-muted/40` or similar tonal shift.
- No borders on active/selected/hover states. Background color change alone indicates state.
- Borders allowed only for: form element affordance (inputs, selects) and structural metaphors (e.g. browser-tab in SandboxTabBar).

Layout & Surface Colors:

- Sidebar is always the darker surface, main content the lighter surface (both light and dark mode).
- Hierarchy comes from: tonal surface contrast > whitespace > typography weight/size.

Hover & Interaction States:

- Hover: `hover:bg-*` (background shift). Never `hover:border-*` or `hover:shadow-*`.
- Active/selected: `bg-*` + `ring-*` if emphasis needed. Never border.
- Keep transitions to `transition-[transform,background-color]` — no `box-shadow` or `border-color` in transitions.

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

Component Structure:

- Max ~250 lines per client component
- Route-level `*Client.tsx` = thin orchestrator (queries, top-level state, layout composition)
- Route-local child components go in `_components/` folder
- Pure helper functions go in `_utils.ts` at route level
- Presentational components (no hooks, no `"use client"`) stay as plain function components
- Only add `"use client"` to child components that use hooks/interactivity
- Inline sub-components defined in the same file should be extracted to `_components/`

Next.js:

- Default to Server Components.
- Client Components are only allowed when:
  - Using state
  - Using effects
  - Handling user interaction
  - Using Convex live queries/mutations
- Never move logic to the client unless strictly required.
- Data fetching should live in Server Components unless Convex live data is required.
- When using Convex:
  - Keep `page.tsx` as a Server Component.
  - Extract interactive/live logic into child Client Components.

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
