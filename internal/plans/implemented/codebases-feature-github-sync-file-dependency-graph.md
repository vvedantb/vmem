# Codebases Feature: GitHub Sync + File Dependency Graph

## Context

Codebases section exists as mock-data UI only. User wants: connect GitHub repos, sync file structure, visualize file-level import/dependency graph using the existing d3-force canvas engine. Like code-review-graph but file-level nodes with import edges.

## Decisions (from user)

- **Nodes**: File-level (not symbol-level)
- **Edges**: Import/require relationships (regex-parsed during sync, content discarded)
- **Auth**: GitHub OAuth App
- **Storage**: Neo4j for graph (file nodes + import edges), Convex for metadata
- **Renderer**: Reuse existing d3-force canvas engine from MemoryGraph
- **Languages**: TS/JS only (import/require parsing)
- **Integration**: Standalone (no memory graph link for now)
- **Repo picker**: List user's repos after OAuth connect

---

## Phase 1: GitHub OAuth + Token Storage

### 1a. Next.js API routes for GitHub OAuth

- `apps/web/app/api/auth/github/route.ts` — redirects to GitHub OAuth authorize URL
- `apps/web/app/api/auth/github/callback/route.ts` — exchanges code for token, stores in Convex
- Env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (add to `apps/web/env/client.ts` for the public ID, server env for secret)

### 1b. Convex: `githubConnections` table

```
githubConnections: defineTable({
  userId: v.id("users"),
  githubUsername: v.string(),
  encryptedAccessToken: v.string(), // encrypted like apiKeys pattern
  avatarUrl: v.optional(v.string()),
  connectedAt: v.number(),
})
  .index("by_user", ["userId"])
```

- `packages/backend/convex/github.ts` — mutations: `storeConnection`, `disconnect`; queries: `getConnection`
- Reuse encryption pattern from `apiKeys` (see `packages/backend/convex/schema.ts` line 30-42)

### 1c. Frontend: Connect GitHub button

- Add to `/codebases` page header — "Connect GitHub" button
- Shows connected state with GitHub username after OAuth
- Disconnect option

---

## Phase 2: Repo Picker + Codebase Creation

### 2a. Convex: `codebases` table

```
codebases: defineTable({
  userId: v.id("users"),
  githubConnectionId: v.id("githubConnections"),
  repoOwner: v.string(),
  repoName: v.string(),
  repoFullName: v.string(), // "owner/name"
  defaultBranch: v.string(),
  language: v.optional(v.string()),
  description: v.optional(v.string()),
  status: v.union(v.literal("pending"), v.literal("syncing"), v.literal("synced"), v.literal("error")),
  totalFiles: v.number(),
  syncedFiles: v.number(),
  lastSyncedAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
})
  .index("by_user", ["userId"])
  .index("by_user_repo", ["userId", "repoFullName"])
```

### 2b. Convex: `listRepos` action

- `packages/backend/convex/codebases.ts`
- Action: decrypt GitHub token → call `GET https://api.github.com/user/repos?per_page=100&sort=updated` → return repo list
- Query: `listMy` — list user's synced codebases
- Mutation: `addCodebase` — create codebase entry (status: "pending")
- Mutation: `removeCodebase` — delete codebase + trigger Neo4j cleanup

### 2c. Frontend: Repo picker modal

- After GitHub connected, "Add Repository" button opens modal
- Lists repos from GitHub (via Convex action)
- Search/filter repos
- Click to add → creates codebase entry

---

## Phase 3: Sync Pipeline

### 3a. Hono API: Sync endpoint

- `apps/api/src/routes/codebases.ts`
- `POST /v1/codebases/sync` — body: `{ codebaseId, repoOwner, repoName, branch, githubToken }`
  1. Fetch repo tree: `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=true`
  2. Filter to TS/JS files (`.ts`, `.tsx`, `.js`, `.jsx`)
  3. For each file: fetch content via `GET /repos/{owner}/{repo}/contents/{path}` (base64)
  4. Parse imports via regex (relative imports only, skip `node_modules`):
     ```
     /(?:import\s+.*?from\s+['"])(\..*?)['"]|(?:require\s*\(\s*['"])(\..*?)['"]\s*\)/g
     ```
  5. Resolve import paths against file tree (try .ts, .tsx, .js, .jsx, /index.\*)
  6. Write to Neo4j: `CodeFile` nodes + `IMPORTS` edges
  7. Return sync result (file count, edge count)

### 3b. Neo4j schema for codebase files

- **Node**: `CodeFile` — `{ id, userId, codebaseId, path, directory, filename, extension, sizeBytes }`
- **Edge**: `(:CodeFile)-[:IMPORTS { importPath }]->(:CodeFile)`
- Index: `CREATE INDEX FOR (f:CodeFile) ON (f.userId, f.codebaseId)`
- Cleanup: `MATCH (f:CodeFile { codebaseId: $id }) DETACH DELETE f` on codebase removal

### 3c. Neo4j service methods

- `apps/api/src/db/codebase-service.ts` (new file, mirrors `memory-service.ts` pattern)
- `syncCodebase(userId, codebaseId, files, edges)` — batch create nodes + edges
- `getCodebaseGraph(userId, codebaseId)` — return all nodes + edges for a codebase
- `deleteCodebase(userId, codebaseId)` — cleanup

### 3d. Convex: Sync action

- `packages/backend/convex/codebases.ts` — `syncCodebase` action:
  1. Read codebase + GitHub token from DB
  2. Decrypt token
  3. Call Hono `POST /v1/codebases/sync` with token + repo info
  4. Update codebase status + file counts
  5. Handle errors → set status: "error" with message

### 3e. Import parser utility

- `apps/api/src/utils/import-parser.ts`
- `parseImports(content: string): string[]` — returns relative import paths
- `resolveImportPath(importPath: string, fromFile: string, fileTree: Set<string>): string | null`

---

## Phase 4: Codebase Graph API

### 4a. Hono endpoint

- `GET /v1/codebases/:codebaseId/graph` (auth required)
- Returns: `{ nodes: CodeFileNode[], edges: ImportEdge[] }`
- Cache: 60s TTL per userId + codebaseId (same pattern as memory graph)

### 4b. Response shape

```ts
interface CodeFileNode {
  id: string;
  path: string;
  directory: string;
  filename: string;
  extension: string;
  sizeBytes: number;
}

interface ImportEdge {
  source: string; // file id
  target: string; // file id
  importPath: string; // original import string
}
```

---

## Phase 5: Frontend — Codebase Graph UI

### 5a. Data layer

- `apps/web/hooks/useCodebaseGraphData.ts` — TanStack Query hook (mirrors `useGraphData.ts`)
  - Calls `GET /v1/codebases/:id/graph`
  - Zod validation
  - Returns nodes + edges

### 5b. Graph data transform

- `apps/web/app/(main)/codebases/[id]/_components/codebase-graph-data.ts`
  - `buildCodebaseGraphData(nodes, edges)` — transform to canvas-ready format
  - Node size: based on import count (degree)
  - Node color: by directory (hash directory path → hue)
  - Directory grouping: compute group IDs for d3-force clustering

### 5c. Canvas adaptation

- Reuse `GraphCanvas.tsx` + canvas engine as-is (it accepts generic `GraphNode[]` + `GraphEdge[]`)
- Adapt the existing `GraphNode` / `GraphEdge` types:
  - `title` = filename, `content` = full path, `tags` = [directory]
  - `edgeType` = "imports" (add to union), `reason` = import path
- New `CodebaseGraph.tsx` wrapper component at `apps/web/app/(main)/codebases/[id]/_components/CodebaseGraph.tsx`
  - Wraps GraphCanvas with codebase-specific controls
  - Directory filter (like tag filter in MemoryGraph)
  - Search files by name

### 5d. Page rewrites

- `apps/web/app/(main)/codebases/page.tsx` — replace mock data with Convex queries
  - List codebases from `codebases` table
  - "Connect GitHub" flow
  - "Add Repository" modal
  - Sync status badges (real-time via Convex subscriptions)

- `apps/web/app/(main)/codebases/[id]/page.tsx` — replace mock file list with graph
  - Top: codebase header (name, branch, status, file count, last synced)
  - Main: full-width CodebaseGraph canvas
  - "Re-sync" button
  - Detail panel on file click (filename, path, imports, imported by)

### 5e. New components

```
apps/web/app/(main)/codebases/
  page.tsx                          — codebases list (rewrite)
  _components/
    ConnectGitHubButton.tsx         — OAuth trigger + connected state
    AddRepoModal.tsx                — repo picker modal
  [id]/
    page.tsx                        — codebase detail (rewrite)
    _components/
      CodebaseGraph.tsx             — graph wrapper (orchestrator)
      CodebaseDetailPanel.tsx       — file detail on click
      DirectoryFilter.tsx           — filter by directory
      codebase-graph-data.ts        — pure transform functions
```

---

## Phase 6: Delete mock data + cleanup

- Delete `apps/web/lib/mock-codebases.ts`
- Remove `as const` assertions from existing pages (CLAUDE.md rule)

---

## Files to modify (summary)

| File                                                   | Action                                            |
| ------------------------------------------------------ | ------------------------------------------------- |
| `packages/backend/convex/schema.ts`                    | Add `githubConnections` + `codebases` tables      |
| `packages/backend/convex/github.ts`                    | New — GitHub connection mutations/queries         |
| `packages/backend/convex/codebases.ts`                 | New — codebase CRUD + sync action                 |
| `apps/api/src/index.ts`                                | Register `/codebases` route                       |
| `apps/api/src/routes/codebases.ts`                     | New — sync + graph endpoints                      |
| `apps/api/src/db/codebase-service.ts`                  | New — Neo4j service for codebase graph            |
| `apps/api/src/utils/import-parser.ts`                  | New — TS/JS import regex parser                   |
| `apps/web/app/api/auth/github/route.ts`                | New — OAuth initiate                              |
| `apps/web/app/api/auth/github/callback/route.ts`       | New — OAuth callback                              |
| `apps/web/app/(main)/codebases/page.tsx`               | Rewrite — real data                               |
| `apps/web/app/(main)/codebases/[id]/page.tsx`          | Rewrite — graph UI                                |
| `apps/web/app/(main)/codebases/_components/*.tsx`      | New — ConnectGitHub, AddRepoModal                 |
| `apps/web/app/(main)/codebases/[id]/_components/*.tsx` | New — CodebaseGraph, DetailPanel, DirectoryFilter |
| `apps/web/hooks/useCodebaseGraphData.ts`               | New — data fetching hook                          |
| `apps/web/components/_components/canvas/types.ts`      | Extend `edgeType` union with "imports"            |
| `apps/web/env/client.ts`                               | Add `NEXT_PUBLIC_GITHUB_CLIENT_ID`                |
| `apps/web/lib/mock-codebases.ts`                       | Delete                                            |

## Verification

1. Connect GitHub via OAuth → verify token stored in Convex
2. List repos → verify repos appear in modal
3. Add repo → verify codebase created with "pending" status
4. Sync → verify files + imports written to Neo4j
5. View graph → verify file nodes + import edges render correctly
6. Click file → verify detail panel shows imports + imported-by
7. `npx tsc` in `apps/web` and `packages/backend` — no type errors
8. `cd packages/backend && npx convex codegen --typecheck enable`

## Unresolved questions

None — all clarified.
