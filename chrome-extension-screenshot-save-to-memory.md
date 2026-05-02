# Chrome Extension: Screenshot → Save to Memory

## Context

Today the extension only saves selected text. Users want to capture visual content (diagrams, UI, charts) the same way they save text — drag a region, click Save, done. We extend the existing selection-popup UX pattern and the existing Convex file-storage pipeline; no new architectural primitives.

## UX

1. User triggers screenshot mode (toolbar icon click + `Ctrl+Shift+S` command).
2. Page dims; cursor becomes crosshair; user drags a rectangle.
3. On mouseup: visible tab captured, cropped to rectangle, shown in floating bar near selection — matches existing selection popup styling (Shadow DOM, dark-mode aware).
4. Floating bar = thumbnail preview + caption input (optional) + Save button.
5. Save → states: saving (spinner) → success (✓) → auto-dismiss. Esc cancels at any stage.

## Capture Strategy

- `chrome.tabs.captureVisibleTab(null, {format: "png"})` from background (needs `activeTab` — already declared).
- Crop in content script: load PNG into `Image`, draw cropped region to `OffscreenCanvas`, `toBlob()` → PNG Blob.
- Account for `devicePixelRatio` when mapping CSS rect → captured-image pixels.

## Files to Add / Modify

### Chrome Extension (`apps/chrome-extension/`)

- `manifest.json` — add `commands` entry for `Ctrl+Shift+S`; ensure `activeTab` present (it is).
- `src/content/screenshot/index.ts` _(new)_ — overlay + region drag logic, crops captured image, mounts save popup. Mirrors structure of `src/content/selection/index.ts`.
- `src/content/screenshot/popup.ts` _(new)_ — Shadow-DOM floating bar with preview img + caption input + Save button. Reuse styling tokens from selection popup (extract shared CSS-in-TS into `src/content/_shared/popupStyles.ts` if duplication grows; otherwise inline for now).
- `src/background/message-handler.ts` — add handlers:
  - `START_SCREENSHOT` — calls `captureVisibleTab`, returns dataUrl + dpr to content script.
  - `SAVE_SCREENSHOT` — receives `{ blob, caption, pageUrl, pageTitle, profileId }`; gets upload URL from Convex, POSTs blob, then calls `api.memoryApi.createMemory` action with image metadata.
- `src/background/index.ts` — register `chrome.commands.onCommand` → inject screenshot script and emit start signal. Same path for toolbar `chrome.action.onClicked`.
- `src/popup/` — add a small "Take screenshot" button that triggers the same flow on the active tab (parity with text-selection sign-in UX).
- `vite.config.ts` / build config — register new `content-screenshot.js` entry.

### Backend (`packages/backend/convex/`)

- `fileImport.ts` — extend allowed `mimeType` set to include `image/png`, `image/jpeg`. Branch in import handler: if image, skip text extraction; store storageId + mimeType + dimensions on the memory.
- `memoryApi.ts` — `createMemory` action: add optional `attachment: v.object({ storageId: v.id("_storage"), mimeType: v.string(), width: v.number(), height: v.number() })` arg. Pass through to Neo4j memory node properties.
- `validators.ts` — add `attachmentFields` const, reused in schema + return validator (per CLAUDE.md single-source-of-truth rule).
- `schema.ts` (if memories table mirrors fields) — add optional `attachment` via `attachmentFields`.
- `neo4jActions/memories.ts` — when creating a memory with attachment, persist `attachmentStorageId`, `attachmentMimeType`, `attachmentWidth`, `attachmentHeight` on the Neo4j node. Skip URL-dedup Layer 1 when attachment present (each screenshot is unique even on same URL).

### Web Dashboard (`apps/web/`)

- Memory detail/list components that render content — if `attachment` present and is image, render `<img>` from Convex storage URL (use `ctx.storage.getUrl(storageId)` server-side or a query that returns signed URL). Minimal: detect mimeType `image/*` and render preview above content.

## Reuse Notes

- Selection popup pattern (`src/content/selection/index.ts`) — copy structure for Shadow-DOM mount, position math, state machine (idle/saving/success/error).
- Auth path (`getStorage("authToken")` → `ConvexHttpClient.setAuth`) — identical to text save.
- File upload (`generateUploadUrl` flow in `convex/fileImport.ts`) — reuse verbatim, just widen mime list.
- `createMemory` action — same call site, just adds `attachment` arg.

## Memory Shape for Screenshot

```
{
  title: caption || `Screenshot from ${hostname}`,
  content: caption || "",          // empty string OK; image is the payload
  type: "screenshot",
  source: "browser-extension",
  tags: [hostname, "screenshot"],
  confidence: 1.0,
  url: pageUrl,
  attachment: { storageId, mimeType: "image/png", width, height },
  profileId,
}
```

## Verification

1. `cd packages/backend && npx convex codegen --typecheck enable` — types clean.
2. Load unpacked extension; visit a page; press `Ctrl+Shift+S`; drag region.
3. Confirm popup shows preview thumbnail + caption input.
4. Click Save → check Convex dashboard: new memory row with `attachment.storageId` populated; storage tab shows the PNG blob.
5. Open web dashboard `/memories` → screenshot memory renders inline image.
6. Cancel paths: Esc during drag, Esc during preview, click outside — all dismiss without saving.
7. Edge: capture on a page with `devicePixelRatio = 2` (retina) and confirm crop alignment.
8. Edge: large region (~3MB PNG) uploads without timeout.

## Open Questions

- Should screenshots also store an OCR text pass for search? (Out of scope for v1; revisit if search UX demands.)
- Full-page (scrolling) capture — defer to v2.
