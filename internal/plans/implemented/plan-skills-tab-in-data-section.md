# Plan: Skills tab in Data section

## Context

Today the sidebar's Data group has Files, Codebases, Usage. No "skills" concept exists anywhere in the repo. The goal is a new `/skills` page styled like Claude's skills page where a user can create/edit/delete skills (name + description + markdown instructions) via manual form or `.md` file upload, and have those skills exposed through the existing MCP server so agents can read them. GitHub-import is explicitly deferred.

## Data model

Add one table in `packages/backend/convex/schema.ts`:

```ts
skills: defineTable({
  userId: v.id("users"),
  name: v.string(),
  description: v.string(),
  instructions: v.string(), // markdown body
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_name", ["userId", "name"]),
```

No `enabled` flag, no trigger hints, no attachments — matches answers.

## Backend: `packages/backend/convex/skills.ts` (new)

Mirrors `codebases.ts` structure. All user-facing functions use `authQuery` / `authMutation` from `./auth`:

- `listMy` (authQuery) — `ctx.db.query("skills").withIndex("by_user", q => q.eq("userId", ctx.userId)).collect()`
- `getById` (authQuery) — normalizeId + userId guard (same pattern as `codebases.getById`)
- `createSkill` (authMutation) — args `{ name, description, instructions }`; check duplicate name via `by_user_name`; insert with `createdAt`/`updatedAt = Date.now()`
- `updateSkill` (authMutation) — args `{ id, name?, description?, instructions? }`; ownership check; patch + bump `updatedAt`
- `deleteSkill` (authMutation) — ownership check + `ctx.db.delete`
- Internal helpers for MCP (see MCP section below):
  - `listByClerkIdInternal` (internalQuery) — takes `clerkId`, resolves to `userId`, returns skills
  - `getByNameInternal` (internalQuery) — `clerkId` + `name`, returns one skill or null

## MCP exposure (read-only from agent side)

Writes stay in the web UI; agents only read.

### 1. Convex HTTP routes in `packages/backend/convex/http.ts`

Two new routes mirroring `/api/mcp/memories/*` pattern:

- `POST /api/mcp/skills/list` — extract bearer token, resolve to clerkId (reuse existing token → clerkId helper used by memory routes via `neo4jActions/mcp`), call `internal.skills.listByClerkIdInternal`, return `{ data: skills[] }`
- `POST /api/mcp/skills/get` — body `{ name }`, resolve token → clerkId, call `internal.skills.getByNameInternal`, return `{ data: skill | null }`

Both return `jsonResponse(...)` just like memory routes.

### 2. MCP client functions in `apps/mcp/src/api-client.ts`

Add `listSkills(token)` and `getSkill(token, name)` following the existing `apiRequest` pattern.

### 3. MCP tools in `apps/mcp/src/tools.ts`

Register two tools in `registerTools`:

- `skills_list` — no args, returns all skills (name + description + instructions)
- `skills_get` — args `{ name: string }`, returns a single skill by name

Follow the existing `textContent` / `errorContent` pattern exactly.

## Frontend: `apps/web/app/(main)/skills/`

Route layout mirrors `codebases/` (simple client orchestrator, no subroutes).

### `page.tsx` (client component, ~70 lines max)

- `useQuery(api.skills.listMy)` → list
- `PageContainer` with title "Skills" and a right-section "Add Skill" button that opens `AddSkillDialog`
- Loading spinner + empty state (`IconBolt`, message "No skills yet. Add one to get started.")
- Grid `grid-cols-1 md:grid-cols-2 gap-4` of `SkillCard` components

### `_components/SkillCard.tsx`

- Shows name (bold), description (muted), short preview of instructions (clamp-3)
- Right-aligned kebab menu with "Edit" and "Delete" actions
- Clicking the card body opens `EditSkillDialog`
- No shadow, no border, `bg-muted/40` surface, hover `hover:bg-muted/60` (per UI rules)

### `_components/AddSkillDialog.tsx`

Single `Dialog` with two entry modes in one form:

1. **Upload .md file** (optional): `<input type="file" accept=".md,.markdown,text/markdown">` → on change, `FileReader.readAsText` → prefill `instructions` textarea. Filename (without extension) prefills `name` if empty. No new dependency; no frontmatter parsing in V1 (user can edit after upload).
2. **Manual fields**: `name` (text), `description` (text), `instructions` (textarea, min-height ~240px, monospace).

Submit calls `useMutation(api.skills.createSkill)`. On success, close dialog and reset form.

### `_components/EditSkillDialog.tsx`

Same form shape as Add, prefilled from the selected skill, calls `updateSkill`. Separate file so each dialog stays small and single-purpose.

### Sidebar: `apps/web/components/sidebar/nav-config.ts`

1. Import `IconBolt` from `@tabler/icons-react`
2. Add `{ href: "/skills", label: "Skills", icon: IconBolt }` to the Data group, after Codebases and before Usage

## Critical files to modify / create

**Modify**

- `packages/backend/convex/schema.ts` — add `skills` table
- `packages/backend/convex/http.ts` — add 2 MCP routes
- `apps/mcp/src/api-client.ts` — add 2 client functions
- `apps/mcp/src/tools.ts` — register 2 tools
- `apps/web/components/sidebar/nav-config.ts` — add Skills nav item

**Create**

- `packages/backend/convex/skills.ts`
- `apps/web/app/(main)/skills/page.tsx`
- `apps/web/app/(main)/skills/_components/SkillCard.tsx`
- `apps/web/app/(main)/skills/_components/AddSkillDialog.tsx`
- `apps/web/app/(main)/skills/_components/EditSkillDialog.tsx`

## Reused existing patterns

- `authQuery`/`authMutation` from `packages/backend/convex/auth.ts`
- `PageContainer` from `apps/web/components/PageContainer`
- `Button`, `Dialog` from `@vmem/ui`
- Card styling pattern from `CodebaseCard.tsx`
- MCP HTTP route pattern from `http.ts` memory routes (lines 182–310)
- MCP tool registration pattern from `tools.ts`
- Token → clerkId helper already used by `neo4jActions/mcp.*` — reuse for skills routes

## Type discipline (per CLAUDE.md)

- No `any`, `unknown`, `as`, `!`
- Skill type = `Doc<"skills">` imported from `@vmem/backend`
- No manually-defined skill interfaces
- Server Components remain server — only `skills/page.tsx` and dialogs are `"use client"`

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — schema + new functions typecheck
2. Start web app, sign in, click Skills in sidebar → lands on `/skills`
3. Click "Add Skill" → fill form manually → submit → card appears
4. Click "Add Skill" → upload a `.md` file → instructions + name prefill → edit description → submit → card appears
5. Kebab → Edit → modify → save → card updates
6. Kebab → Delete → confirm → card disappears
7. From an MCP-connected client (Claude Desktop or Inspector), call `skills_list` → returns the created skills; call `skills_get` with a name → returns one skill

## Open questions

- None — all four answered in the pre-plan questionnaire (fields, add method, scope, icon).
