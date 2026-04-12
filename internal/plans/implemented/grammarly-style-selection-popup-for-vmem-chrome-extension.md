# Grammarly-Style Selection Popup for vmem Chrome Extension

## Context

Currently, saving content to vmem requires right-clicking → "Save page to vmem" (saves entire page) or using the popup. No way to save a specific text selection. Adding a Grammarly-style floating icon on text highlight gives users one-click saving of selected text — the most natural interaction for "I want to remember this."

## UX

- User highlights text → small vmem logo circle (~28px) fades in near the selection
- Click → icon shows spinner → checkmark (saved) or X (error) → auto-hides after 1.5s
- One-click save: title auto-generated from first ~80 chars of selection, tagged with hostname + "selection"
- Toggle on/off in extension popup Settings tab (stored in `chrome.storage`, enabled by default)
- Min 3 chars to trigger. No popup on right-click selections.

## Files to modify/create

### 1. `src/types/messages.ts` — add message type

Add to `ContentMessage` union:

```
| { type: "SAVE_SELECTION"; selectedText: string; pageUrl: string; pageTitle: string }
```

Reuse existing `SAVE_RESULT` / `SAVE_DUPLICATE` response types — no new response variants.

### 2. `src/types/storage.ts` — add toggle setting

Add `selectionPopupEnabled: boolean` to `ExtensionStorage` type.

### 3. `src/lib/storage.ts` — default toggle to `true`

Update `getStorage()` to default `selectionPopupEnabled: true`.

### 4. `src/background/message-handler.ts` — handle SAVE_SELECTION

New `case "SAVE_SELECTION"`:

- Title: first ~80 chars of `selectedText` (trimmed, ellipsis if truncated)
- `createMemory({ title, content: selectedText.slice(0, 10000), type: "knowledge", source: "browser-extension", tags: [hostname, "selection"], confidence: 1.0, url: pageUrl })`
- Return `SAVE_RESULT` or `SAVE_DUPLICATE` (same as `SAVE_PAGE` handler)

### 5. `src/content/selection/index.ts` — NEW global content script (core)

**Shadow DOM setup:**

- Custom element `<vmem-selection-popup>` appended to `document.body`
- `position: fixed`, `z-index: 2147483647`, `pointer-events: none` on host
- `attachShadow({ mode: "closed" })` — isolate from page CSS/JS
- Inject Instrument Sans font via `@import` inside Shadow DOM `<style>`

**Popup DOM (inside shadow):**

- Single `div` container with vmem logo SVG icon (~28px circle)
- `position: fixed`, `pointer-events: auto` on the popup itself
- States: `idle` → `ready` → `saving` → `success`/`error`
  - `idle`: `display: none`
  - `ready`: vmem icon visible
  - `saving`: spinner animation
  - `success`: checkmark icon, auto-hide 1.5s
  - `error`: red X icon, auto-hide 2s

**Positioning logic:**

- `selection.getRangeAt(0).getBoundingClientRect()` → viewport coords
- Place 8px below selection, horizontally centered on selection rect
- Viewport boundary clamping (flip above if no room below, clamp left/right)

**Event handling:**

- `mouseup` on `document` (primary trigger) → `requestAnimationFrame` → check selection → show/position
- Skip if `event.button === 2` (right-click)
- `selectionchange` on `document` (debounced 100ms) → hide when selection cleared
- `scroll` + `resize` on `window` (passive, RAF-throttled) → reposition
- `mousedown` on popup → `preventDefault()` to preserve text selection

**On click:**

- Capture selected text on show (not on click — selection may clear)
- Send `{ type: "SAVE_SELECTION", selectedText, pageUrl: location.href, pageTitle: document.title }` via `chrome.runtime.sendMessage`
- Transition through saving → success/error states

**Toggle check:**

- On load, read `selectionPopupEnabled` from `chrome.storage.local`
- Listen for `chrome.storage.onChanged` to react to toggle changes in real-time
- Skip all event listeners when disabled

**Edge cases:**

- Use `data-vmem-selection` attribute (NOT `data-vmem`) to avoid conflict with `removeExistingVmemButtons()`
- Min 3 chars trimmed to trigger
- Works in iframes via `all_frames: true` in manifest

### 6. `manifest.json` — register content script

```json
{
  "matches": ["<all_urls>"],
  "js": ["content-selection.js"],
  "run_at": "document_idle",
  "all_frames": true
}
```

No new permissions needed — `<all_urls>` already in `host_permissions`.

### 7. `scripts/build.ts` — add build step

```ts
console.log("Building selection content script...");
await build(
  createContentScriptConfig(
    "content-selection",
    "src/content/selection/index.ts",
    mode,
  ),
);
```

### 8. `src/popup/_components/SettingsForm.tsx` — add toggle switch

Add a toggle/switch for "Show save popup on text selection" above the API URL field. Reads/writes `selectionPopupEnabled` in `chrome.storage.local`.

## Styling reference

- Reuse `VMEM_BUTTON_STYLES` values: `#ebebee` bg, `#2a2a2f` color, `12px` radius, same shadow + transition
- Compact: 28px icon circle for idle state
- Animation: `opacity 0→1`, `translateY(4px→0)`, `240ms cubic-bezier(0.22,1,0.36,1)`

## Implementation order

1. Types (`messages.ts`, `storage.ts`) + storage default
2. Background handler (`message-handler.ts`)
3. Content script (`selection/index.ts`) — Shadow DOM + popup + positioning + events
4. Manifest + build script
5. Settings toggle in popup
6. Polish: animations, edge cases, test on various sites

## Verification

- Build: `cd apps/chrome-extension && pnpm build`
- Load unpacked in `chrome://extensions` → test on any webpage
- Highlight text → icon appears below selection → click → check vmem dashboard for new memory
- Test edge cases: scroll while popup visible, select near viewport edges, right-click, toggle off in settings
- Test on ChatGPT/Claude pages — confirm no conflict with existing buttons
