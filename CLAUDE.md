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
- If you are creating any plans, then make sure that running /ship skill is the final step (unless the user explicitly says not to)

Convex:

- Never manually define interfaces for Convex documents.
- Always import:
  - `Doc<"tableName">`
  - `Id<"fieldName">`
  - `FunctionReturnType<typeof api.functionName>`
- Convex types are the single source of truth.
- If the schema changes, all consumers must update automatically.
- Never duplicate schema types manually.
- To typecheck Convex: `pnpm --filter @vmem/backend typecheck` (= `tsgo -p tsconfig.json`, ~1.4s warm / ~3.6s cold, no dev server needed). Do NOT use `convex codegen --typecheck enable` — it spends ~13s on cloud round-trips (download/upload deployment state) then SKIPS the typecheck ("No `tsgo` binary found", exits 1) because pnpm hoists `tsgo` to the workspace-root `.bin` and Convex only looks in the package-local `.bin`. tsgo checks against the already-generated `_generated/` (excluded from the config but loaded via imports); if you changed schema/functions and the dev server isn't running, run `pnpm convex` (or `convex codegen`) once to refresh `_generated/` first.
- **`pnpm convex`** = Convex **dev** server (`npx convex dev` → dev deployment). When the user says "run convex" / `pnpm convex`, use this — **not** deploy.
- **`pnpm convex:deploy`** = prod deploy — only when the user explicitly asks to deploy.
- Schema migration chicken-egg problem: When changing a field type with existing data, use v.union(oldType, newType) temporarily → deploy → run migration → change to only newType
- Single source of truth for table fields: Define table fields as exported `const xxxFields = { ... }` in `validators.ts`. Use in both `schema.ts` (`defineTable(xxxFields)`) and return validators (`v.object({ _id: v.id("table"), _creationTime: v.number(), ...xxxFields })`). Never duplicate field definitions between schema and return validators.
- Do not mirror Convex query data into `useState` for form inputs. Convex queries are live/reactive — bind the input's `value` directly to the query result and call the mutation directly in `onChange`. If the input needs instant feedback without waiting for a server round-trip (e.g. textareas, fast-typing fields), attach `.withOptimisticUpdate` to the mutation to patch the local query cache. No local state, no hydration `useEffect`, no debounce draft copy.
- Backend layout (Eva-aligned): `convex/` = registered functions + orchestration + `convex/prompts/` + `convex/cloudLib/` (Convex-coupled chat tools). `engine/` = Neo4j/codebase/parsers outside `convex/` (like Eva's `callback-src/`) — imported only from `"use node"` actions. `neo4j-cli/` = seed/eval/unseed scripts. `tests/` = unit tests importing from `engine/` or `convex/` (Eva puts tests at package root, not inside `convex/`). Memory actions: thin `neo4jActions/memories.ts` facade → `neo4jActions/_memories/` (handlers + `actions.ts`). From `convex/`, import narrow `engine/neo4j/memory/*` modules directly.
- Client package imports: apps import only `@vmem/backend` (Convex `api` + `Doc`/`Id` types) and `@vmem/shared` (cross-app constants + client-safe prompt helpers like `PARSER_VERSION`, `buildSkillsIndexAddition`). Never `@vmem/backend/*` subpaths. `@vmem/backend` root must stay Convex-only — no constants or prompts re-exported.

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
- `text-foreground/<NN>` is a **no-op** (renders full opacity — the oklch text token ignores Tailwind's alpha modifier; verified `/75` `/55` === full). For graded text emphasis use `text-muted` or inline `style={{ opacity }}`. Surface bg tokens DO support the modifier (`bg-surface-secondary/40` etc.).
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

Motion (framer-motion / motion-react):

- Never put `initial={false}` on a self-running keyframe loop (`animate={{ x: [...] }}` + `repeat: Infinity`). `initial={false}` skips the enter animation, so the loop never starts. It works in dev only because React StrictMode double-mounts and re-kicks it — in the production build it renders frozen. Symptom: an animation that's fine on local dev but static on the deployed/prod build. For loops, omit `initial` (motion uses the first keyframe) or pass an explicit initial object. `initial={false}` is correct only for state-driven animations (animate value changes on state/prop change, no keyframe array).

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

## Claude Fable: token parsimony

When running as Fable (expensive), plan and review; delegate implementation to subagents (`model: sonnet` for code, `haiku` for mechanical edits/searches), one task per subagent. Trivial single-file edits are fine to do directly.

explain vmem using verbs instead of nouns.

“We’re building a cloud platform for AI”

No one knew that that meant, their eyes glazed over. Then I started saying this instead:

“We containerize your code and run it on GPUs in the cloud so you don’t have to manage the infra yourself”

That clicked way more. Our brains understand verbs because they’re more concrete. If you describe your company using nouns, you risk people not understanding you.

And no one buys or invests in things they don’t understand.
