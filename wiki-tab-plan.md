# Wiki Tab — Plan

## Context

Add a new **Wiki** area to vmem under the Data sidebar group. Behaves like Obsidian: rich-text WYSIWYG editor over markdown, nestable folders/documents tree, live outline pane, autosave, and search. v1 ships plain docs only — `[[wikilinks]]`, backlinks, tags, graph view are deferred.

Answers locked in:

- Editor: **TipTap Markdown WYSIWYG**
- Layout: **Three-pane** (tree | editor | outline)
- v1 features: CRUD + folders/nested hierarchy + autosave + search bar
- Deferred: wikilinks, backlinks panel, tags, graph

## 1. Convex schema

New file: `packages/backend/convex/validators.ts` (introduce pattern per project CLAUDE.md).

```ts
// validators.ts
import { v } from "convex/values";

export const wikiNodeFields = {
  userId: v.id("users"),
  parentId: v.optional(v.id("wikiNodes")), // undefined = root
  kind: v.union(v.literal("folder"), v.literal("document")),
  title: v.string(),
  // TipTap ProseMirror JSON, serialized. null for folders.
  contentJson: v.optional(v.string()),
  // Plain text mirror for full-text search. null for folders.
  contentText: v.optional(v.string()),
  order: v.number(), // for manual ordering within a parent
  createdAt: v.number(),
  updatedAt: v.number(),
};
```

Extend `packages/backend/convex/schema.ts`:

```ts
wikiNodes: defineTable(wikiNodeFields)
  .index("by_user", ["userId"])
  .index("by_user_parent", ["userId", "parentId"])
  .searchIndex("search_content", {
    searchField: "contentText",
    filterFields: ["userId"],
  })
  .searchIndex("search_title", {
    searchField: "title",
    filterFields: ["userId"],
  }),
```

Single table for folders + documents — simplest model, matches Obsidian (folders are just nodes with children). `kind` discriminates.

## 2. Convex backend

New file: `packages/backend/convex/wiki.ts`. All queries/mutations use existing `authQuery`/`authMutation` from `./auth`.

- `listTree` (query): returns all wikiNodes for `ctx.userId`. Client assembles tree by `parentId`. One query keeps live-reactivity trivial.
- `getNode` (query): by id, scoped to userId.
- `createNode` (mutation): args `{ parentId?, kind, title }`. Sets `order = max(sibling.order) + 1`. Returns new `_id`.
- `renameNode` (mutation): `{ id, title }`.
- `updateContent` (mutation): `{ id, contentJson, contentText }`. Sets `updatedAt`. Only for `kind === "document"`.
- `deleteNode` (mutation): `{ id }`. Recursively deletes descendants in one mutation (fetch all userNodes, traverse in-memory, delete set).
- `moveNode` (mutation): `{ id, newParentId?, newOrder }`. For future drag-reorder; expose but UI optional in v1.
- `search` (query): `{ queryText }`. Union search on `search_title` + `search_content`, dedupe, return up to 20 nodes. Uses Convex `searchIndex`.

## 3. Sidebar

File: `apps/web/components/sidebar/nav-config.ts`.

- Import `IconNotebook` from `@tabler/icons-react`.
- Append to Data group items (between `Codebases` and `Usage` — keeps Usage as last analytics item):
  ```ts
  { href: "/wiki", label: "Wiki", icon: IconNotebook },
  ```

## 4. Route — `/wiki`

Folder: `apps/web/app/(main)/wiki/`

### Files

- `page.tsx` — thin client wrapper (keeps route-level simple, reads search params).
- `_components/WikiWorkspace.tsx` — three-pane shell. Uses `PageContainer` with `noScroll` + custom layout.
- `_components/WikiTree.tsx` — left pane. Builds tree from `listTree` query. Collapsible folders, context menu (New doc / New folder / Rename / Delete), click-to-select.
- `_components/WikiEditor.tsx` — center pane. Wraps TipTap. Receives selected node id.
- `_components/WikiOutline.tsx` — right pane. Subscribes to editor heading structure, renders jump-links.
- `_components/WikiSearch.tsx` — search bar (top of left pane). Debounced `search` query. Results clickable.
- `_components/WikiBreadcrumb.tsx` — above editor, ancestor chain.
- `_utils.ts` — `buildTree(nodes)`, `findAncestors(node, allNodes)`, `extractHeadings(editorJson)`, `htmlToPlainText` helpers.
- `searchParams.ts` — nuqs schema exporting `nodeIdParser` for `?doc=<id>`.

### Layout

```
PageContainer (title="Wiki", noScroll)
  grid grid-cols-[260px_1fr_220px] gap-4 h-full
    <WikiTree />          // bg-muted/40, rounded, scrollable
    <WikiEditor />         // lighter surface, scrollable
    <WikiOutline />       // bg-muted/40, sticky headings list
```

Tonal surfaces only (per UI rules): tree + outline on `bg-muted/40`, editor pane on default bg. **No borders between panes** — gap + background contrast.

### Selection state

- Selected document id lives in URL via `nuqs` → `useQueryState("doc", nodeIdParser)`.
- `WikiTree` writes on click; `WikiEditor` reads. Survives refresh + shareable.

## 5. TipTap editor

Dependencies to add in `apps/web/package.json`:

- `@tiptap/react`
- `@tiptap/pm`
- `@tiptap/starter-kit`
- `tiptap-markdown`

Only the web app — backend stores JSON/plain-text, doesn't need TipTap.

### Component: `WikiEditor.tsx`

- `useEditor` with `StarterKit` + `Markdown` extension (from `tiptap-markdown`).
- Loads `contentJson` from `getNode`; `editor.commands.setContent(JSON.parse(contentJson))` when node changes.
- Title rendered as a separate `<input>` above editor body (Obsidian-style). Renames via `renameNode` on blur.
- **Autosave**: `onUpdate` → debounced 800ms → call `updateContent({ id, contentJson: JSON.stringify(editor.getJSON()), contentText: editor.getText() })`. Debounce via a small `useDebouncedCallback` hook (add to `apps/web/hooks/`).
- Outline sync: expose editor state up via `onUpdate`; `WikiWorkspace` holds headings array, passes to `WikiOutline`.
- Empty state: if no `?doc` selected → centered "Select or create a document" placeholder.

### Outline pane

- Traverses `editor.state.doc` for `heading` nodes, reads `level` + text + pos.
- Click → `editor.commands.focus(pos)` + scroll.
- Updates on `onUpdate`.

## 6. Search

- `WikiSearch` component at top of left pane: input + dropdown results.
- Uses `useQuery(api.wiki.search, { queryText })` when input non-empty (skip on empty).
- Clicking a result sets `?doc=<id>` and clears search.

## 7. URL state (nuqs)

Confirm `nuqs` is installed — per project CLAUDE.md it should be. If missing, add to `apps/web` deps. `searchParams.ts` exports:

```ts
import { parseAsString, createParser } from "nuqs";
export const docParser = parseAsString.withDefault("");
```

Used via `useQueryState("doc", docParser)`.

## 8. Critical files

**New**

- `packages/backend/convex/validators.ts`
- `packages/backend/convex/wiki.ts`
- `apps/web/app/(main)/wiki/page.tsx`
- `apps/web/app/(main)/wiki/searchParams.ts`
- `apps/web/app/(main)/wiki/_utils.ts`
- `apps/web/app/(main)/wiki/_components/WikiWorkspace.tsx`
- `apps/web/app/(main)/wiki/_components/WikiTree.tsx`
- `apps/web/app/(main)/wiki/_components/WikiEditor.tsx`
- `apps/web/app/(main)/wiki/_components/WikiOutline.tsx`
- `apps/web/app/(main)/wiki/_components/WikiSearch.tsx`
- `apps/web/app/(main)/wiki/_components/WikiBreadcrumb.tsx`
- `apps/web/hooks/useDebouncedCallback.ts` (if not already present)

**Modified**

- `packages/backend/convex/schema.ts` — add `wikiNodes` table.
- `apps/web/components/sidebar/nav-config.ts` — add Wiki item.
- `apps/web/package.json` — add tiptap deps.

## 9. Reused primitives

- `apps/web/components/PageContainer.tsx` — shell wrapper (`noScroll` mode).
- `packages/ui` — `Button`, `Input`, `DropdownMenu` (for tree context menu), `Command` (search dropdown), `Dialog` (rename/confirm delete).
- `packages/ui/src/motion/presets.ts` — reuse motion tokens for pane fade-in.
- `streamdown` — NOT used for editing; retained only for chat markdown. TipTap handles wiki rendering.
- `packages/backend/convex/auth.ts` — `authQuery`/`authMutation`.

## 10. Type hygiene (per CLAUDE.md)

- No `any`, `unknown`, or `as`.
- All document types via `Doc<"wikiNodes">`, `Id<"wikiNodes">`, `FunctionReturnType<typeof api.wiki.listTree>`.
- TipTap's `JSONContent` type from `@tiptap/react` for outline parsing — avoids `any` on doc traversal.

## 11. Future-scope hooks (not implemented)

Schema already supports future additions without migration:

- Wikilinks: parse `[[title]]` in `contentText` on save into a new `wikiLinks` table (future migration, additive).
- Tags: parse `#tag` into `wikiTags` table (additive).
- Graph: query wikiLinks + d3-force.

Leave a short `// TODO(v2): wikilinks` comment in `updateContent` mutation where link extraction would hook in.

## 12. Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — zero type errors.
2. `cd apps/web && npx tsc --noEmit` — zero errors after new deps installed.
3. Manual end-to-end (visual, per user preference):
   - Sidebar shows **Wiki** under Data.
   - `/wiki` loads three-pane empty state.
   - Create folder → create document inside → appears in tree.
   - Type in editor → refresh page → content persists (autosave works).
   - Edit title → blur → tree updates live.
   - Add `# H1`, `## H2` → outline pane lists them → click jumps.
   - Search bar finds doc by title and by body content.
   - Delete folder → confirms → recursively removes children.
   - Reload with `?doc=<id>` → correct doc opens.

## Unresolved questions

- None blocking. Minor: should title rename also autosave on each keystroke or only on blur? Assumption: **blur only** (less churn, matches Notion). Flag if you want live-save.
