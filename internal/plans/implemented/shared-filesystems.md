# Files: Shared AI Filesystem (backend + MCP tools + wire up web UI)

## Context

`/files` route UI is fully built but **100% mock**: `useFilesData` fetches `/api/files` (doesn't exist anywhere), folder create/move/delete only mutate local state, download generates fake blob text. No `files` table in Convex schema. No file MCP tools.

Goal: real shared filesystem for AI agents. Web UI for humans + MCP tools (`files_list`, `files_get`, `files_upload`, `files_delete`) for agents. E2E: Gemini generates image → saves to vmem via MCP → Claude/ChatGPT sees it via `files_get` (image returned as MCP image content block).

Decisions (confirmed with user): **path-based addressing**, **core 4 tools only**, **upload via base64 OR sourceUrl fetch**, **Convex storage**.

Patterns to clone:

- `convex/wiki.ts` + `wikiNodeFields` (validators.ts:260) — user-scoped folder/doc tree, exact shape needed
- `convex/memoryApi.ts:50` `generateMemoryUploadUrl` — signed upload URL flow (web upload)
- `convex/mcp/toolCatalog.ts` / `toolHandlers.ts` / `tools.ts` — tool registration
- `convex/mcp/wiki.ts` — internal actions backing MCP tools

## 1. Schema — `packages/backend/convex/validators.ts` + `schema.ts`

```ts
export const fileNodeFields = {
  userId: v.id("users"),
  /** undefined = root-level node */
  parentId: v.optional(v.id("fileNodes")),
  kind: v.union(v.literal("folder"), v.literal("file")),
  name: v.string(),
  /** files only */
  mimeType: v.optional(v.string()),
  size: v.optional(v.number()),
  storageId: v.optional(v.id("_storage")),
  createdAt: v.number(),
  updatedAt: v.number(),
};
```

```ts
fileNodes: defineTable(fileNodeFields)
  .index("by_user", ["userId"])
  .index("by_user_parent", ["userId", "parentId"]),
```

## 2. Web-facing Convex functions — new `packages/backend/convex/files.ts`

Mirror `wiki.ts` (authQuery/authMutation):

- `listTree` (authQuery) — all user's fileNodes + `totalBytes` (sum sizes) + `storageLimit` const (10 GiB, defined here)
- `generateFileUploadUrl` (authMutation) — `ctx.storage.generateUploadUrl()`
- `createFile` (authMutation) — args `{ name, parentId?, storageId, mimeType, size }`; validates parent is user's folder
- `createFolder` (authMutation) — `{ name, parentId? }`
- `renameNode` (authMutation) — `{ nodeId, name }` (UI has rename stub "coming soon" — wire it)
- `moveNodes` (authMutation) — `{ nodeIds[], targetParentId? }`; reject moving folder into own descendant
- `deleteNodes` (authMutation) — `{ nodeIds[] }`; recursive descendant delete + `ctx.storage.delete(storageId)` per file
- `getDownloadUrl` (authQuery) — `{ nodeId }` → `ctx.storage.getUrl(storageId)`

Shared path/tree helpers (resolve path → node, build path strings, collect descendants) in `convex/files/lib.ts` (plain functions, used by both `files.ts` and `mcp/files.ts`).

## 3. MCP internal actions — new `packages/backend/convex/mcp/files.ts`

Path semantics: `/`-separated, relative to root, exact name match. All scoped by `clerkId` (same as `mcp/wiki.ts` — MCP scope ignored, files are user-wide).

- `mcpListFiles({ clerkId, path? })` — no path: full tree as `[{ path, kind, size, mimeType, updatedAt }]`; with path: that folder's children
- `mcpGetFile({ clerkId, path })` — returns `{ path, mimeType, size, contentBase64?, text?, downloadUrl }`:
  - image/\* ≤ ~4 MB → `contentBase64` (for MCP image content block)
  - text-ish (text/\*, json, md) ≤ ~100 KB → `text` inline
  - always include signed `downloadUrl` (`ctx.storage.getUrl`)
- `mcpUploadFile({ clerkId, path, contentBase64?, sourceUrl?, mimeType? })` — action ("use node" not required; default runtime `fetch` + `atob`/Buffer works in node actions — put alongside other mcp actions matching wiki's runtime):
  - exactly one of contentBase64/sourceUrl required; sourceUrl → server `fetch`, infer mimeType from response Content-Type if omitted; cap ~10 MB
  - `ctx.storage.store(blob)` → internal mutation: auto-create missing folders along path; **if file exists at path → replace** (delete old blob, update storageId/size/mimeType/updatedAt)
- `mcpDeleteFile({ clerkId, path })` — file or folder (recursive), deletes blobs

## 4. MCP tool registration

- `toolHandlers.ts`: `runFilesList/Get/Upload/Delete` wrapping `safe(...)` → `ctx.ctx.runAction(internal.mcp.files.*)`, + zod schemas (path string, base64, sourceUrl url)
- `toolCatalog.ts`: add 4 `toolSpec` entries
- `tools.ts`: register. **`files_get` needs custom result shaping** (not plain `toMcpContent`): when result has `contentBase64` + image mimeType, return content `[{ type: "image", data, mimeType }, { type: "text", text: metadata/downloadUrl JSON }]` so Claude renders the image. Other tools use standard `toMcpContent`.
- Tool descriptions mention: shared user filesystem, path-based, upload auto-creates folders + overwrites existing path.
- Check `vmem://context_prompt` / instructions text — if MCP server instructions enumerate tool families, mention files tools there too (look at `mcp/resources.ts` + `mcpServerInfo`).

## 5. Wire up web UI — `apps/web/src/components/files/`

Per CLAUDE.md: bind Convex queries directly, no useState mirrors.

- **Delete** `filesApi.ts`; rewrite `_hooks/useFilesData.ts` → thin wrapper over `useQuery(api.files.listTree)` (no local mutation helpers — Convex is reactive). Drop `removeFileLocally`/`addFileLocally`/`updateFilesLocally` from `FilesClient.tsx`; call mutations directly.
- **Types**: replace manual `FileItem` interface (`lib/file-types.ts`) with `Doc<"fileNodes">` from `@vmem/backend`; keep `FileCategory` + derive via `fileCategoryFor(kind, mimeType)` helper in `files/_utils.ts`. Components switch `id→_id`, `itemType→kind`, `parentFolderId→parentId`, `uploadedAt→createdAt` (number). Mechanical rename across `FileGrid`, `FileListView`, `FilePreviewModal`, `MoveFolderDialog`, `BreadcrumbNav`, `_utils.ts` sort.
- **Upload** (`FileUploadModal.tsx`): replace FormData POST with `generateFileUploadUrl` → `fetch(url, { method: "POST", body: file })` → `createFile({ storageId, ... })` (same flow as `MemoryContext.tsx:364`).
- **Download**: `getDownloadUrl` → open/anchor real URL (kill mock blob in `FilesClient.handleDownload`).
- **Folder create / move / rename / delete (incl. bulk)**: call real mutations; remove optimistic local-state plumbing.
- **Image previews** (`FilePreviewModal`): use `getDownloadUrl` for `<img src>`.

## 6. Verification

1. `cd packages/backend && npx convex codegen --typecheck enable`; `npx tsc` in apps/web
2. Web (visual, per user pref): upload image + pdf + txt on `/files`, create folder, move, rename, delete, download — confirm persistence after reload, storage bar real
3. MCP via dev endpoint (`https://outgoing-reindeer-268.eu-west-1.convex.site/mcp`): `files_upload` (base64 small png + sourceUrl), `files_list`, `files_get` (confirm image content block), `files_delete`
4. User's E2E: Gemini → generate image → save to vmem (sourceUrl or base64) → web `/files` shows it → Claude `files_get` sees the image

## Resolved-by-me defaults (flag if wrong)

- Upload to existing path **overwrites** (replace blob) — agent-friendly idempotency
- Files are user-wide (no profile/team scoping), same as wiki
- Storage limit 10 GiB constant, enforced on MCP upload + web createFile (reject when over)
- MCP upload cap 10 MB (Convex 16 MiB action-arg limit w/ base64 overhead); web upload cap matches existing UI behavior (no extra cap beyond Convex storage)

## Unresolved questions

None blocking.
