# Index /files uploads into the memory graph

## Context

Audit verdict: the shared-filesystem feature (`/files` web view + MCP `files_*` tools) is **pure storage** — `convex/files.ts` and `convex/mcp/files.ts` write `fileNodes` + Convex storage blobs and never touch Neo4j. Files never appear in memory retrieval.

Meanwhile `convex/fileImport.ts` (memory imports) already does the full pipeline for an uploaded PDF/TXT/MD: extract text → `createMemoryInternal` → dedup (externalId/url/hash/semantic) → embedding → enrichment (tags/entities) → chunking (`HAS_CHUNK` → `Chunk` nodes, >2000 chars) → context-prompt invalidation → retrievable. `CreateMemoryArgs` already supports `storageId`/`mimeType`/`originalFilename` on the Memory node.

Goal: wire the files feature into that existing pipeline so every indexable upload becomes a retrievable memory, with lifecycle sync (overwrite/delete/rename) and a one-shot backfill.

User decisions: text+PDF only (no vision) · delete derived memory on file delete · backfill existing files · show indexed badge + link in /files · **index both personal AND team-drive files**.

Post-rebase note (commit `8c4d3248` team-wide files): `fileNodes` now carry optional `teamId` (team drive, pooled quota, member-editable). MCP file tools remain personal-only (team nodes invisible there). Team memories = memories with the team profile's `profileId` (`engine/neo4j/memory/team.ts` filters `m.profileId`; `profiles` docs carry optional `teamId`), so team files index under the team profile and surface in team-scoped memory reads for all members.

## Design

- 1 file → 1 memory, `sourceType: "file-node"`, `externalId` = fileNode `_id` (Layer-0 dedup tuple), `source: "file-upload"`, type `knowledge`, title = file name, content = extracted text, `storageId`/`mimeType`/`originalFilename` passed through.
- Memory author + profile per scope: always the creator's clerkId (`node.userId` → `users` doc). Personal node → user's **default** profile (`internal.profiles.getOrCreateDefaultByClerkIdInternal` — deterministic; do NOT leave profileId undefined, that falls back to the MCP-active profile which is unrelated context). Team node → the team's profile (`profiles` doc where `teamId === node.teamId`; add a small internal query if none exists). `resolveProfileIdForClerkId` passes explicit profileIds through untouched (verified in `_memories/shared.ts`).
- Linkage lives on the Convex doc: new optional `fileNodeFields` — `memoryId?: string` (Neo4j UUID), `indexStatus?: "pending" | "indexed" | "skipped" | "failed"`, `indexedAt?: number`. Optional fields → no schema migration.
- Indexing is async: create/upsert mutations set `indexStatus` and `ctx.scheduler.runAfter(0, …)` a `"use node"` action (parsers need Buffer/pdf-parse, same as fileImport.ts).
- Overwrite = delete old memory + re-create (full re-embed/re-enrich/re-chunk; `runUpdateMemory` rebuilds chunks but does NOT re-embed/re-enrich — verified in `_memories/update.ts`, so update would leave a stale embedding).
- Delete guard: only delete a memory when (a) `memory.sourceType === "file-node"` (content-hash dedup can collapse onto a pre-existing import memory — never delete those) and (b) no other surviving fileNode references the same `memoryId` (identical-content files share one memory).
- Rename: cheap `updateMemoryInternal { title }` (no re-index). Move: no-op.

## Changes

### 1. Schema — `packages/backend/convex/validators.ts`

Add to `fileNodeFields`: `memoryId`, `indexStatus`, `indexedAt` (all optional, as above). `schema.ts` picks it up automatically.

### 2. Shared kind detection — `packages/backend/convex/files/lib.ts`

Move `detectFileKind(filename, mimeType): "pdf" | "text" | null` from `fileImport.ts` here (pure, V8-safe), broaden text branch to cover `text/*`, `application/json`, `+json`, xml, markdown (same predicate as `isTextualMime` in `mcp/files.ts`). `fileImport.ts` imports it back. Used in mutations to set initial `indexStatus` ("pending" vs "skipped").

### 3. New `"use node"` action file — `packages/backend/convex/fileIndexing.ts`

- `indexFileNodeInternal({ fileNodeId })`:
  1. Internal query (add to `files.ts`): fetch node + creator's `clerkId` (via `users` doc) + resolved `profileId` (default profile for personal nodes; team profile for `teamId` nodes, per Design).
  2. Not a file / no `storageId` / kind null → patch `indexStatus: "skipped"`.
  3. Read blob, extract text via `engine/parsers/pdf.ts` `extractPdfText` / `engine/parsers/text.ts` `extractTextFromBlob`. Empty text → "skipped".
  4. If node already has `memoryId` (overwrite path): guarded delete (rules above) via `deleteMemoryInternal`.
  5. `ctx.runAction(internal.neo4jActions.memories.createMemoryInternal, …)` with the design args incl. explicit `profileId` (tags `["files", kind]` — enrichment replaces them anyway when an OpenRouter key exists).
  6. Patch node `{ memoryId, indexStatus: "indexed", indexedAt }` (new internal mutation in `files.ts`). Catch → `indexStatus: "failed"`.
- `cleanupFileMemoriesInternal({ entries: { memoryId, clerkId }[] })`: guarded `deleteMemoryInternal` per entry (sourceType check via `getMemory`, surviving-fileNode check via Convex query). clerkId per entry = the node creator's, not the actor's — Neo4j memory ops match on the author's userId.
- `backfillFileNodeIndex()`: iterate all `fileNodes` where `kind === "file"` and `indexStatus === undefined` (personal AND team); schedule `indexFileNodeInternal` per node (stagger a few hundred ms apart to be gentle on Neo4j/embeddings).

### 4. Hook lifecycle — `packages/backend/convex/files.ts`

- `createFile` (web, both scopes): set initial `indexStatus` from `detectFileKind` ("pending" when indexable, else "skipped") and schedule `indexFileNodeInternal` when pending.
- `upsertFileByPathInternal` (MCP — personal-only by design): same, in both insert & overwrite branches. Overwrite always re-schedules (content changed).
- `deleteSubtree`: collect `{ memoryId, creator clerkId }` for deleted file nodes that have a `memoryId`; schedule one `cleanupFileMemoriesInternal` call. Actor ≠ creator is fine for team nodes — cleanup runs under the creator's clerkId, and `assertContentDeletable` already gated the delete itself.
- `renameNode`: if node has `memoryId`, schedule `updateMemoryInternal { title: newName }` under the creator's clerkId.

### 5. Web UI — `apps/web/src/components/files/`

- `_hooks/useFilesData.ts`: add `memoryId`/`indexStatus` to the `FileItem` view-model mapping.
- `FileListRow.tsx` + `FileGridItem.tsx`: small tonal badge for `indexed` ("In memory", links to the memory detail route — check `routeTree.gen.ts` for the current workspace-scoped path after the profiles-as-top-level-route refactor); muted state for `failed`. Follow design system: tonal background, no border/shadow. Skipped/pending show nothing (avoid noise).

### 6. MCP tool description — where `files_upload` is registered (`convex/mcp/tools.ts` / schemas)

One-line description addition: text and PDF uploads are auto-indexed into memory and appear in `memory_search`.

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable`; web typecheck.
2. Visual (user's preferred style): run dev, upload a `.md` and a `.pdf` in `/files` → badge appears after a beat → click through to the memory detail → memory has content, enrichment tags, chunks (if >2000 chars); confirm it surfaces in memory search/retrieval. Upload an image → no badge (skipped).
3. Team drive: upload a `.md` into a team drive → memory appears in the TEAM workspace's memory list (team profile), visible to another member; deleting the file (as creator or owner) removes it.
4. Overwrite same path via MCP `files_upload` → memory content refreshed (new memory id on the node). Delete file → memory gone from memories list. Rename → memory title updates.
5. Backfill: `npx convex run fileIndexing:backfillFileNodeIndex` → existing files gain badges.
6. No `any`/`unknown`/`as`/`!`; update CLAUDE.md Files section + `/changelog`.

## Out of scope (noted for later)

- Image captioning via OpenRouter vision (user deferred).
- DOCX/other formats — would need a new parser dependency.
- Surfacing file-backed memories specially in retrieval results (they already carry `originalFilename`/`storageId`).

## Unresolved questions

None — file types, delete sync, backfill, and UI surfacing all confirmed with user.
