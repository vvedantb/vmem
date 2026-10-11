# Audit: vmem Wiki vs Verve

> Update: the owner chose immediate removal with no MCP stub window. The tables stay, deprecated, until `wikiExport:exportAll` output is imported into Verve.

**Date:** 2026-10-11  
**Scope:** read-only. No app code changed.  
**Question:** Now that Verve exists (notes app, repo `vvedantb/verve`, Convex prod `agreeable-hornet-875`), does vmem still need Wiki, or can it use Verve?

**Claude Code:** used. `claude` was on PATH (`/home/ubuntu/.nvm/versions/node/v22.23.3/bin/claude`). A print-mode read-only pass confirmed schema, MCP scope, graph coupling, skills, and the absence of wiki in retrieve / `context_pack` / Dream Mode.

**Verdict:** vmem Wiki is a **notes tree**, not part of the memory engine. Memory retrieve, `context_pack`, embeddings, Dream Mode, HTTP `/api/v1`, SDK, and the Chrome extension do **not** read wiki rows. Verve already covers folders, pages, markdown, search, versions, MCP CRUD, and more (backlinks, tags, archive, daily notes). **Recommended option: (a) remove Wiki after a verified, idempotent migration into Verve**, with a short MCP stub period. Do **not** drop tables until a prod-wide count on `clear-bear-690` is run (this session had no Convex admin token).

---

## 1. What the vmem Wiki consists of

Wiki is a folder/document/artifact tree stored in Convex. Product copy calls it “long-form notes, separate from memories” (`apps/docs/features/wiki-and-files.mdx`).

### 1.1 Schema

Only two tables (`packages/backend/convex/schema.ts`, fields in `validators.ts`).

#### `wikiNodes`

| Field                     | Type                                   | Notes                                             |
| ------------------------- | -------------------------------------- | ------------------------------------------------- |
| `userId`                  | `Id<"users">`                          | Owner                                             |
| `teamId`                  | optional `Id<"teams">`                 | Set for **web team wiki**; MCP rejects these rows |
| `parentId`                | optional `Id<"wikiNodes">`             | Folder parent                                     |
| `kind`                    | `"folder" \| "document" \| "artifact"` | Folders have no body                              |
| `title`                   | string                                 | FTS `search_title`                                |
| `content`                 | optional string                        | Markdown (docs) or source (artifacts)             |
| `contentText`             | optional string                        | Plain-text FTS mirror (`search_content`)          |
| `language`                | optional string                        | Artifacts only (`html`, `svg`, `tsx`, `sql`, …)   |
| `order`                   | number                                 | Sibling sort                                      |
| `createdAt` / `updatedAt` | number                                 | Epoch ms                                          |

Indexes: `by_user`, `by_user_parent`, `by_team`, `by_team_parent`. Search indexes filter on `userId` / `teamId`.

**Absent:** wiki embeddings, wiki link table, public-page flag, `memoryId` FK, backlinks.

Shared kinds: `@vmem/shared` `packages/shared/src/wiki.ts` (`WikiNodeKind`, `wikiKindHasContent`, `wikiKindLabel`).

#### `wikiNodeVersions`

Immutable pre-overwrite snapshots (`lib/versionSnapshot.ts`). Burst window 15 minutes for web; MCP writes always `force: true`.

| Field                             | Type              |
| --------------------------------- | ----------------- |
| `nodeId`                          | `Id<"wikiNodes">` |
| `title`, `content`, `contentText` | snapshot body     |
| `language`                        | optional          |
| `authorUserId`                    | `Id<"users">`     |
| `source`                          | `"web" \| "mcp"`  |
| `createdAt`                       | number            |

Index: `by_node`. Web restore writes the snapshot markdown back through `wiki.updateContent` with `forceSnapshot` (`WikiHistoryPanel`). There is no dedicated restore mutation.

### 1.2 Convex functions

There is no `wikiApi.ts`. Public surface is `api.wiki.*` and `api.wikiVersions.*`.

| Function                             | Kind           | Role                           |
| ------------------------------------ | -------------- | ------------------------------ |
| `wiki.listTree`                      | query          | Scoped tree (`teamId?`)        |
| `wiki.getNode`                       | query          | ACL via `isContentReadable`    |
| `wiki.createNode`                    | mutation       | folder / document / artifact   |
| `wiki.renameNode`                    | mutation       |                                |
| `wiki.updateContent`                 | mutation       | body + optional force snapshot |
| `wiki.deleteNode` / `deleteNodes`    | mutation       | subtree + versions             |
| `wiki.moveNode`                      | mutation       | cycle guard                    |
| `wiki.search`                        | query          | FTS title+content, max 20      |
| `wikiVersions.list` / `get`          | query          | history                        |
| `internal.wiki.listForGraphInternal` | query          | web graph                      |
| `internal.wiki.*ByClerkIdInternal`   | query/mutation | MCP personal only              |

Helpers: `wiki/path.ts` (`parentPath` auto-creates folders), `lib/wikiContent.ts`, `lib/versionSnapshot.ts`.

Search is Convex FTS only. MCP `wiki_search` may Jev-rerank the top hits when `AI_GATEWAY_API_KEY` is set (`jevRankItems`, task `"wiki-search"`). Fail-open to FTS order.

No server job auto-generates wiki pages. Writes from agents go through MCP + system skills.

### 1.3 MCP tools (personal `/mcp` only)

Registered in `packages/backend/convex/mcp/toolsWiki.ts`, catalog `toolCatalog.ts`. All six have `scopes: ["personal"]`. Team connector `/mcp/team` does not expose them (`apps/docs/mcp/overview.mdx`, `features/teams.mdx`).

| Tool          | Args                                                                                    | Behaviour                                     |
| ------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| `wiki_list`   | none                                                                                    | Flat index, no body                           |
| `wiki_get`    | `id`                                                                                    | + `contentMarkdown`                           |
| `wiki_search` | `query`                                                                                 | `{ id, title, kind, excerpt }` + optional Jev |
| `wiki_create` | `kind`, `title`, optional `parentId` **or** `parentPath`, `contentMarkdown`, `language` | Missing folders on `parentPath` are created   |
| `wiki_update` | `id`, optional title/body/`contentMode` (`replace`\|`append`)/`language`                | MCP always snapshots first                    |
| `wiki_delete` | `id`                                                                                    | `{ deletedCount }` including subtree          |

Docs in `apps/docs/mcp/tools.mdx` are slightly stale: they omit `artifact`, `parentPath`, and `language`.

### 1.4 Web

Routes: `/$profileId/wiki`, `/$profileId/wiki/`, `/$profileId/wiki/$docId`. Nav: `nav-config.ts`, `WikiSidebarNav`. Components under `apps/web/src/components/wiki/` (tree, TipTap document editor, artifact editor with HTML/SVG preview, search, outline, history, bulk delete).

Also:

- Command palette calls `api.wiki.search`.
- Memories list merges wiki rows via `useMemoryListSupplementaryItems` → `wikiRowsToListItems`.
- Web graph: kinds `wiki-document` / `wiki-folder`, edges `wikiParentEdges` (`graphApi.ts`). Artifacts render as `wiki-document`.
- Marketing: `LandingWikiPreview`, slides `app-wiki.png`.

Web supports **team** wiki (`teamId` on create/list/search). MCP cannot see those rows (`getOwnedNode` requires `teamId === undefined`).

### 1.5 Other clients

| Surface                   | Wiki?                 |
| ------------------------- | --------------------- |
| Chrome extension          | No                    |
| `@vmem/sdk`               | No                    |
| HTTP `/api/v1/memories/*` | No                    |
| Mobile on `main`          | Archived; not present |
| CLI package               | None in this repo     |

### 1.6 Agent / LLM features

| Feature                                   | Touches wiki?                                       |
| ----------------------------------------- | --------------------------------------------------- |
| MCP `wiki_*`                              | Yes — CRUD/search                                   |
| System skills `wiki-writeup`, `teach-me`  | Yes — write under `Learning/`                       |
| Retired seeds `setup-wiki`, `update-wiki` | Already retired names                               |
| Jev `wiki-search`                         | Yes — reorder only                                  |
| `context_prompt` / `context_pack`         | **No** (skills index may still _name_ wiki-writeup) |
| Memory retrieve / embeddings              | **No**                                              |
| Dream Mode                                | **No**                                              |
| MCP `memory_graph`                        | **No**                                              |
| Web `graphApi.getGraphData`               | **Yes** — account atoms, first page, non-local      |

`wiki-writeup` may `memory_add` a stub with a pointer to the wiki doc. That is a string in memory content, not a schema link.

### 1.7 Docs and tests

Docs: `apps/docs/features/wiki-and-files.mdx`, MCP overview/tools, teams (personal MCP), environment (Jev wiki search), `docs.json` nav, root `README.md`, `CLAUDE.md`, backend/shared READMEs.

Tests: `packages/backend/tests/wiki*`, MCP tool path/catalog, `jevRank` wiki-search, web wiki utils/nav/graph, `e2e/specs/wiki.spec.ts` (`@wiki` smoke).

---

## 2. Dependencies: what breaks if Wiki is removed

### 2.1 Does not break (memory product)

- Hybrid retrieve, vector embeddings, Jev retrieve rerank
- `context_pack` / `vmem://context_prompt` (except skill playbooks that mention wiki tools)
- Dream Mode
- MCP `memory_graph`
- HTTP memories API and SDK
- Chrome extension
- Files (`fileNodes` is a parallel tree; `memoryId` on files is unrelated)

There is **no** `memories` → `wikiNodes` foreign key. Retrieval never queries wiki FTS.

### 2.2 Breaks or needs a rewrite

1. Entire `/wiki` workspace, sidebar item, command-palette wiki group.
2. Six personal MCP tools (agents that already call `wiki_*`).
3. System skills `wiki-writeup` and `teach-me` (they call `wiki_create` with `parentPath: "Learning"`).
4. Web graph wiki nodes and `wikiParentEdges` (memory/skill/entity graph remains).
5. Memories **list UI** supplementary wiki rows / kind filters.
6. Landing/slides wiki preview.
7. Tables `wikiNodes` / `wikiNodeVersions` and version snapshot helpers.
8. Docs and `@wiki` e2e.

**Soft:** Jev helper stays for related memories / skill recommend; only the wiki-search call site goes away.

### 2.3 Coupling summary

Wiki is **co-located in the dashboard and personal MCP**, not wired into the memory runtime. Removal is a product/surface cut, not a retrieve regression — except agent playbooks and UI chrome.

---

## 3. Usage in prod (`clear-bear-690`)

### 3.1 Admin table stats: **not available in this session**

Convex CLI had no access token:

```
CONVEX_DEPLOYMENT=prod:clear-bear-690
npx convex data --deployment clear-bear-690
# → 401 MissingAccessToken
```

No `CONVEX_DEPLOY_KEY` in the agent environment. `packages/backend` had no `.env.local`. Dashboard `getStats` counts memories only, not wiki. Existing `api.wiki.*` functions are per-user and auth-gated; they cannot give fleet-wide counts.

**Do not guess row counts.** Run the queries in §3.3 on a machine that is logged into the Convex project.

### 3.2 Owner-scoped sample (same Clerk user on vmem MCP and Verve MCP)

vmem `whoami`: Clerk `user_2y2nYffNuI7BwVs9zNblXIVFZTf`, personal profile. Verve `get_me`: same Clerk id, email `vedantbhopatrao15@gmail.com`.

| Store                             | What we saw                                                               | Recency                          |
| --------------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| vmem `wiki_list`                  | **2 nodes**: folder `Velth` + document `manual-dogfood-REPORT 2026-10-02` | `updatedAt` 2026-10-02T20:00:38Z |
| Verve `count_table` (user-scoped) | **302 pages**, **68 folders**                                             | live MCP, 2026-10-11             |

That is **one user**, not the fleet. It shows this owner already treats Verve as the notes app and barely uses vmem Wiki.

### 3.3 Exact read-only queries to run (bandwidth-aware)

Do **not** `collect()` the whole table in one shot. Page 100 rows. Do **not** `--push` and do **not** run mutations.

From `packages/backend`, after `npx convex login` (or `CONVEX_DEPLOY_KEY` for prod):

**A. Table presence**

```bash
CONVEX_DEPLOYMENT=prod:clear-bear-690 npx convex data --deployment clear-bear-690
```

**B. Newest row (small)**

```bash
npx convex data wikiNodes --deployment clear-bear-690 --limit 1 --order desc --format jsonl
npx convex data wikiNodeVersions --deployment clear-bear-690 --limit 1 --order desc --format jsonl
```

**C. Aggregates (inline readonly query)**

```bash
npx convex run --deployment clear-bear-690 --inline-query '
export default query({
  handler: async (ctx) => {
    const kinds = { folder: 0, document: 0, artifact: 0 };
    const users = new Set();
    const teamUsers = new Set();
    let n = 0;
    let teamN = 0;
    let lastUpdated = 0;
    let contentChars = 0;
    let cursor = null;
    for (;;) {
      const page = await ctx.db.query("wikiNodes").order("asc").paginate({
        numItems: 100,
        cursor,
      });
      for (const row of page.page) {
        n += 1;
        users.add(String(row.userId));
        if (row.teamId !== undefined) {
          teamN += 1;
          teamUsers.add(String(row.teamId));
        }
        if (row.kind === "folder" || row.kind === "document" || row.kind === "artifact") {
          kinds[row.kind] += 1;
        }
        if (row.updatedAt > lastUpdated) lastUpdated = row.updatedAt;
        contentChars += (row.content ?? "").length + (row.contentText ?? "").length;
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    let versions = 0;
    let vCursor = null;
    for (;;) {
      const page = await ctx.db.query("wikiNodeVersions").order("asc").paginate({
        numItems: 100,
        cursor: vCursor,
      });
      versions += page.page.length;
      if (page.isDone) break;
      vCursor = page.continueCursor;
    }
    return {
      wikiNodes: n,
      wikiNodeVersions: versions,
      uniqueUserIds: users.size,
      teamNodeCount: teamN,
      uniqueTeamIds: teamUsers.size,
      kinds,
      lastUpdatedIso: lastUpdated === 0 ? null : new Date(lastUpdated).toISOString(),
      contentPlusTextChars: contentChars,
    };
  },
});
'
```

`--inline-query` is documented as sandboxed read-only. Still: no `--push`, no `convex deploy`, no `import`/`export` unless the operator wants a backup zip.

Record `uniqueUserIds`, `kinds.artifact`, `teamNodeCount`, and `lastUpdatedIso` before choosing cutover.

---

## 4. Verve comparison

Sources: live Verve MCP (this session) against prod `agreeable-hornet-875` via the connected `verve` server; `list_tables` schema; GitHub `vvedantb/verve` was **not** readable (`gh`: repository not resolved — likely private). No Verve app code was modified.

### 4.1 Verve already covers (notes core)

| Need                | vmem Wiki                                     | Verve                                                                         |
| ------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Nested folders      | `wikiNodes` kind folder                       | `folders` (`parentId`, `create_folder` / `list_folders` / `move_folder`)      |
| Documents           | kind `document` + markdown                    | `pages` + `create_page` / `update_page` / `get_page` (`content_markdown` GFM) |
| Search              | FTS title+`contentText`, max 20, optional Jev | `search_pages` FTS title+content, no embeddings                               |
| List / get / delete | MCP + web                                     | MCP + app                                                                     |
| Append vs replace   | `contentMode`                                 | `append_to_page` (collab-safe) vs `update_page`                               |
| Versions            | `wikiNodeVersions` (web restore)              | `pageVersions`, `list_page_versions`, `get_page_version`, `save_page_version` |
| Move / rename       | yes                                           | `move_page(s)`, `rename_page`, `rename_folder`                                |
| Path-like create    | `parentPath` auto folders                     | `create_folder` then `create_page` with `folder_id` (no single path arg)      |

### 4.2 Verve extras Wiki does not have

Backlinks (`pageLinks`, `list_backlinks`, `get_local_graph`), tags, aliases, favorites, archive/unarchive, daily notes (`get_or_create_daily_note`), templates, page files, AI-visible flag, TOC/icon, collab ProseMirror, tasks/habits/countdowns/focus (adjacent product).

`pageOwners` exists (`pageId` + `userId`). That may support sharing; this audit did not prove a team wiki equivalent.

### 4.3 Wiki-specific gaps in Verve

| Wiki feature                                          | In Verve?                 | Notes                                                                                                 |
| ----------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Auto-generated pages                                  | Neither has a server cron | Both rely on agent skills (`wiki-writeup` / `teach-me` today)                                         |
| Memory-linked citations                               | No FK in vmem either      | Optional `memory_add` text pointer; Verve would use the same pattern or a URL                         |
| Public unauthenticated pages                          | **Neither**               | Wiki routes sit behind the signed-in shell                                                            |
| Team-scoped tree                                      | **Wiki web yes; MCP no**  | Verve MCP is “pages you own”. Confirm `pageOwners` before claiming team parity                        |
| Artifact kind (HTML/SVG live preview, TSX/SQL source) | **Gap**                   | Verve pages are editor documents; `upload_file` can attach source but there is no iframe preview kind |
| Jev rerank on wiki search                             | Wiki MCP only             | Verve search is FTS only                                                                              |
| In-dashboard graph atoms                              | Wiki yes                  | Verve has `get_local_graph` **inside Verve**, not on the vmem memory graph                            |
| Single MCP for memory + notes                         | Wiki sits on vmem `/mcp`  | Agents would need **two** connectors (vmem + Verve) unless wiki stubs proxy                           |

### 4.4 Verve MCP tools useful for migration

Notes CRUD: `list_folders`, `create_folder`, `list_pages`, `create_page` (markdown + `folder_id` + tags), `get_page`, `update_page`, `append_to_page`, `search_pages`, `delete_page(s)`, `archive_page(s)`, `move_page(s)`, `rename_page`.

Import-ish: markdown body on `create_page`; `upload_file` / `generate_file_upload_url` for attachments (Convex ~1MB on `upload_file`). **No bulk zip/markdown import tool** on the MCP catalog we inspected.

Idempotency hooks: `set_page_aliases` (store `vmem-wiki:<nodeId>`), tags e.g. `vmem-wiki`.

### 4.5 Product fit

vmem’s stated job is a **shared inspectable memory graph** (`CLAUDE.md`). Wiki is long-form notes. Verve is the notes app. Keeping both means two markdown trees, two MCP write paths, and skills that teach agents the weaker tree.

---

## 5. Recommendation

### Options

**(a) Remove Wiki after one-time migration into Verve** (recommended, gated on §3.3)

Move existing nodes into a Verve folder named `vmem wiki` (per user). Point skills at Verve MCP. Stub then delete `wiki_*`. Drop tables last.

**(b) Keep as read-only legacy**

Hide create/edit in the web UI; MCP writes return “use Verve”. Tables stay. Cost: still pay schema, graph merge, FTS indexes, and user confusion. Use only if §3.3 shows many users or large bodies and migration slips.

**(c) Keep Wiki**

Only if team wiki or artifacts are load-bearing after the prod count, or if you refuse a second MCP in agent setups. Then document Wiki as “in-dashboard scratch notes” and stop adding features.

**Choice:** **(a)**, because Wiki is isolated from retrieve, Verve already supersedes the notes UX for the owner we could observe, and dual trees fight entropy. Revisit if §3.3 shows many `uniqueUserIds`, many `artifact` rows, or non-trivial `teamNodeCount`.

### Phased removal (no data deletion until verified)

Each step is its own PR. Dry-run first. Idempotent mapping `wikiNodeId → vervePageId/folderId`.

| PR       | Change                                                                                                                                                                                                                                                                   | Data                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| 0 (this) | Audit doc only                                                                                                                                                                                                                                                           | none                                       |
| 1        | Operator run of §3.3 + optional `npx convex export` zip of `wikiNodes` / `wikiNodeVersions` (backup, not delete)                                                                                                                                                         | read / export                              |
| 2        | Offline migrator: dry-run JSON report (counts, path collisions, artifact list); then apply via Verve MCP `create_folder` + `create_page` with alias `vmem-wiki:<id>` and tag `vmem-wiki`. Skip already-aliased ids                                                       | Verve writes; **vmem wiki rows unchanged** |
| 3        | Rewrite `wiki-writeup` / `teach-me` seeds to Verve tools (`create_folder` `Learning`, `create_page`). Keep skill **names**                                                                                                                                               | skills only                                |
| 4        | MCP deprecation window: `wiki_list/get/search` still read vmem; `wiki_create/update/delete` return a stable error/body: `{ deprecated: true, use: "Verve MCP", folderHint: "vmem wiki" }` (or proxy create into Verve if you want zero agent breakage). Changelog + docs | no vmem deletes                            |
| 5        | Web: hide Wiki nav or show read-only + “open in Verve” copy; strip wiki from command palette, list supplementary items, landing/slides                                                                                                                                   | UI                                         |
| 6        | After N days (suggest 14–30) and a second dry-run diff: remove MCP tools, `api.wiki*`, graph wiki atoms, web routes, tests, docs                                                                                                                                         | still **no table drop**                    |
| 7        | Confirm Verve page counts vs migrator report. Then schema PR: drop `wikiNodes` / `wikiNodeVersions`                                                                                                                                                                      | delete only after sign-off                 |

**Migration rules**

- **Idempotent:** lookup alias `vmem-wiki:<wikiNodeId>` (or tag + title+path) before `create_page`.
- **Dry-run:** print planned folders/pages, byte sizes, artifacts, team-scoped nodes (team rows need a policy: skip, copy into owner’s Verve, or leave until team Verve exists).
- **Documents:** `content` markdown → `create_page` `format: "markdown"`.
- **Folders:** recreate tree under `vmem wiki` (and keep `Learning/` if present).
- **Artifacts:** page with fenced source + language in title, or `upload_file`; flag in the report — preview will not match Wiki.
- **Versions:** migrate current body only unless an operator asks for `save_page_version` per snapshot (extra bandwidth).
- **No vmem `db.delete` in the migrator.** Deletion is PR 7 only.

**MCP deprecation for agents**

Keep tool **names** for one window so hosts do not fail schema load. Return a pointer, not a silent no-op. After the window, remove from `toolCatalog`. Team MCP is already wiki-free.

### Risk list

| Risk                                              | Severity        | Mitigation                                                         |
| ------------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| Unknown fleet usage (no admin query this session) | High until §3.3 | Block table drop on counts                                         |
| Team wiki has no proven Verve home                | Medium          | Count `teamId` rows; skip or copy                                  |
| Artifacts / live HTML preview lost                | Medium          | Inventory `kind=artifact`; accept gap or keep a tiny preview later |
| Agents still calling `wiki_*`                     | Medium          | Stub period + skill rewrite                                        |
| Two MCPs for “notes + memory”                     | Medium          | Document Verve URL; optional later proxy                           |
| Dual-write during stub+proxy                      | Low             | Prefer stub-with-pointer over proxy unless breakage is high        |
| Migrator duplicates                               | Low             | aliases + dry-run                                                  |
| Convex bandwidth on full-table collect            | Low if paged    | 100-row paginate; no `collect()`                                   |
| Wiki restore history not copied                   | Low             | export zip; current body in Verve                                  |
| Graph UI loses wiki atoms                         | Low             | Memory graph stays; notes graph lives in Verve                     |
| Landing/slides still show Wiki                    | Low             | PR 5 copy                                                          |

---

## 6. Method

- Read `CLAUDE.md` and linked domain docs (`architecture.mdx`, `environment.mdx`, `packages/backend/README.md`, `convex/README.md`, `features/wiki-and-files.mdx`).
- Inspected schema, `wiki.ts`, MCP tools, graph, skills, web routes, extension/SDK greps.
- Claude Code read-only confirmation (2026-10-11).
- Live vmem + Verve MCP for the authenticated owner only.
- Convex prod CLI: **401**, so fleet numbers are omitted on purpose.
