# Files Page → File Explorer Redesign

## Context

Current files page is a flat table with storage bar + upload/preview modals. No backend exists (stub `/api/files` fetch calls). Redesigning to look/feel like a real file browser (Finder/Explorer) with folder hierarchy, breadcrumbs, grid+list toggle, multi-select, inline folder creation, and context menus.

## Decisions

- **Folders**: full support — breadcrumb nav, inline create, "Move to..." context menu
- **Views**: grid + list toggle, persisted in URL via nuqs
- **Selection**: multi-select (click, ctrl+click, shift+click, select-all), bulk delete/download/move
- **Storage**: compact Finder-style bottom status bar
- **Backend**: keep stubs — UI-only, wired up later
- **Sorting**: folders always first, then files sorted by selected criteria

---

## Shared Type — `apps/web/lib/file-types.ts`

```ts
interface FileItem {
  id: string;
  name: string;
  itemType: "file" | "folder";
  mimeType: string; // "" for folders
  fileCategory: string; // "pdf"|"image"|"doc"|"excel"|"generic"|"folder"
  size: number; // 0 for folders
  uploadedAt: string;
  parentFolderId: string | null; // null = root
  thumbnailUrl?: string;
  previewContent?: string;
  itemCount?: number; // folders: child count
}
```

## URL State — `apps/web/app/(main)/files/searchParams.ts`

- `view`: `"grid" | "list"` (default `"grid"`)
- `sort`: `"name" | "size" | "date"` (default `"name"`)
- `sortDir`: `"asc" | "desc"` (default `"asc"`)
- `folderId`: `string | null` (current folder, default `null` = root)

---

## Component Tree

```
page.tsx (server, just renders <FilesClient />)
└─ FilesClient ("use client", ~180 lines, orchestrator)
   ├─ PageContainer
   │   leftSection:  <BreadcrumbNav />
   │   rightSection: <FileToolbar />
   ├─ BulkActionBar (sticky top, shown when selection > 0)
   ├─ FileDropZone (full area drop target)
   │   ├─ FileGrid or FileListView (based on `view` param)
   │   │   ├─ InlineNewFolder (editable name, appears when creating)
   │   │   └─ FileGridItem / FileListRow (each wrapped in FileContextMenu)
   │   └─ FileEmptyState (when no items in current folder)
   ├─ StorageStatusBar (bottom)
   ├─ FileUploadModal (existing, modified)
   ├─ FilePreviewModal (existing, modified)
   └─ MoveFolderDialog (folder picker for "Move to...")
```

---

## New Files

### `apps/web/lib/file-types.ts` (~15 lines)

Shared `FileItem` interface. Single source of truth.

### `apps/web/app/(main)/files/searchParams.ts` (~15 lines)

nuqs param definitions. Follow `memories/searchParams.ts` pattern.

### `apps/web/app/(main)/files/_utils.ts` (~35 lines)

- `formatFileSize(bytes)` — human-readable size
- `formatDate(dateString)` — "Apr 12, 2026" format
- `getFileIcon(fileCategory)` — returns Tabler icon component
- `sortFiles(files, sort, sortDir)` — sorts with folders-first

### `apps/web/app/(main)/files/_hooks/useFileSelection.ts` (~60 lines)

`useReducer`-based selection logic:

- Actions: `select`, `toggle`, `range`, `selectAll`, `clear`
- Handles click, ctrl+click, shift+click, checkbox, select-all
- Returns: `{ selectedIds, handlers, isSelected, isAllSelected, selectedCount }`

### `apps/web/app/(main)/files/_components/`

| Component              | Lines | Description                                                                                                                                                                             |
| ---------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FilesClient.tsx`      | ~180  | Orchestrator: fetches files, manages modals, delegates to children. Uses `useQueryStates` for view/sort/folder. Uses `useFileSelection` hook.                                           |
| `BreadcrumbNav.tsx`    | ~50   | Shows root > parent > current path. Clickable segments navigate via `folderId` param. Uses separator arrows.                                                                            |
| `FileToolbar.tsx`      | ~70   | View toggle (grid/list tabs w/ icons), sort dropdown, sort direction toggle, "New Folder" button, "Upload" button.                                                                      |
| `FileGrid.tsx`         | ~40   | CSS grid container (`grid-cols-2 sm:3 md:4 lg:5 xl:6`). Maps items to `FileGridItem`. Renders `InlineNewFolder` at start when creating.                                                 |
| `FileGridItem.tsx`     | ~80   | Card: aspect-square icon/thumbnail area, name (truncated), size below. Checkbox overlay on hover (top-left). Click = preview (file) or navigate (folder). Wrapped in `FileContextMenu`. |
| `FileListView.tsx`     | ~50   | Table with header: checkbox, icon+name, size, date, actions. Maps to `FileListRow`. Select-all checkbox in header.                                                                      |
| `FileListRow.tsx`      | ~70   | Table row: checkbox, icon+name, size, date, dots menu. Click = preview/navigate. Wrapped in `FileContextMenu`.                                                                          |
| `FileContextMenu.tsx`  | ~55   | Wraps children in `<ContextMenu>`. Items: Open, Download (files only), Move to..., Rename (folders), separator, Delete. Calls parent handlers.                                          |
| `FileDropZone.tsx`     | ~55   | Drag-over overlay ("Drop files to upload"), calls `onFilesDropped`. Visual: dashed border + icon overlay on drag.                                                                       |
| `FileEmptyState.tsx`   | ~20   | Minimal: `IconFolder` + "This folder is empty" + "Upload files or create a folder" + Upload CTA. Root empty: "No files yet".                                                            |
| `StorageStatusBar.tsx` | ~30   | Bottom bar: `"12 items · 1.2 GB of 10 GB used"` with thin `<Progress>` (h-1). Muted colors.                                                                                             |
| `BulkActionBar.tsx`    | ~45   | Sticky bar: `"{N} selected"` + Download, Move, Delete buttons. Appears/disappears with motion animation.                                                                                |
| `InlineNewFolder.tsx`  | ~50   | Renders in grid/list as editable folder item. Auto-focused input, "Untitled Folder" default. Enter=confirm, Escape=cancel.                                                              |
| `MoveFolderDialog.tsx` | ~80   | Dialog with folder tree picker. Shows folder hierarchy, user selects destination, confirm moves selected files.                                                                         |

---

## Modified Files

### `apps/web/app/(main)/files/page.tsx`

Rewrite to ~10 lines: server component that renders `<FilesClient />`.

### `apps/web/components/FileUploadModal.tsx`

- Import `FileItem` from `@/lib/file-types` (remove duplicated interface)
- Add `initialFiles?: File[]` prop — pre-populates queue when files are dropped on the page
- Keep everything else

### `apps/web/components/FilePreviewModal.tsx`

- Import `FileItem` from `@/lib/file-types` (remove duplicated interface)
- Remove duplicated `formatFileSize`, `formatDate`, `getFileIcon` — import from shared utils or keep local (since it's outside the route)

---

## Key UX Details

**Grid view**: Square cards, large icon centered (48px for generic, thumbnail fills for images). Name below icon (1 line, truncated). Size below name (muted). Checkbox fades in on hover (top-left corner). Selected = subtle primary ring.

**List view**: Compact rows. Checkbox → 32px icon → name (flex-1) → size → date → dots menu. Selected = subtle primary background.

**Folder navigation**: Double-click folder in grid, single-click in list → updates `folderId` URL param → breadcrumb updates → files refetch for that folder.

**Inline new folder**: Appears as first item in grid/list. Input auto-focused. On Enter: stub POST to create folder, add to list. On Escape or empty blur: cancel.

**Multi-select**: Click = single select (clears others). Ctrl/Cmd+Click = toggle. Shift+Click = range from last-selected. Checkbox = toggle without clearing. Header checkbox = select/deselect all.

**Drag-drop upload**: Dragging files over content area shows semi-transparent overlay. On drop → opens FileUploadModal with `initialFiles` pre-populated.

**Context menu**: Different items for files vs folders. Files: Open, Download, Move to..., Delete. Folders: Open, Move to..., Rename, Delete.

---

## Implementation Order

1. `lib/file-types.ts` + `_utils.ts` + `searchParams.ts`
2. `useFileSelection.ts` hook
3. Leaf components: `FileEmptyState`, `StorageStatusBar`, `FileContextMenu`, `InlineNewFolder`
4. `FileGridItem` → `FileGrid`
5. `FileListRow` → `FileListView`
6. `FileToolbar`, `BreadcrumbNav`, `BulkActionBar`
7. `FileDropZone`
8. `MoveFolderDialog`
9. `FilesClient` (orchestrator)
10. Rewrite `page.tsx`
11. Modify `FileUploadModal` + `FilePreviewModal`

## Verification

- Run `npx tsc` in `apps/web` to verify no type errors
- Navigate to `/files` — should see empty grid view with breadcrumb showing "Files" root
- Toggle grid/list → URL updates, view switches
- Change sort → URL updates, (mock) files reorder
- Right-click in content area → context menu appears
- Click "New Folder" → inline editable folder appears
- Click "Upload" → upload modal opens
- Drag files onto page → overlay appears, drop opens upload modal with files
