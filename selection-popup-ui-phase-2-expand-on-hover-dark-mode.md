# Selection Popup UI Phase 2 — Expand-on-Hover + Dark Mode

## Context

Phase 1 shipped a working 32px solid circle popup. It works but feels static — always light #ebebee regardless of page theme, icon-only with no text hint. Two improvements: expand into a pill with "Save to vmem" on hover for discoverability, and detect OS dark/light preference so the popup doesn't jar on dark sites.

## Single file to modify

`apps/chrome-extension/src/content/selection/index.ts`

## Change 1: SVGs → `currentColor`

All three SVG constants use hardcoded fills/strokes. Switch to `currentColor` so CSS `color` property controls them:

- `VMEM_ICON`: `fill="#2a2a2f"` → `fill="currentColor"` (×3 paths)
- `CHECK_ICON`: `stroke="#16a34a"` → `stroke="currentColor"`
- `ERROR_ICON`: `stroke="#dc2626"` → `stroke="currentColor"`

## Change 2: Add label element to DOM

After `iconContainer`, add:

```ts
const label = document.createElement("span");
label.className = "vmem-label";
label.textContent = "Save to vmem";
popup.appendChild(label);
```

## Change 3: Replace CSS `styleEl.textContent`

### Base `#vmem-popup`

- Add `color: #2a2a2f` (drives `currentColor`)
- `border-radius: 50%` → `border-radius: 99px` (stays circular at 32px, becomes pill when expanded)
- Add `overflow: hidden`, `white-space: nowrap`
- Add `padding: 8px`, `box-sizing: border-box`
- Add `border: 1px solid transparent` (dark mode transitions to visible border, no layout shift)
- Extend transition to include: `width`, `padding`, `color`, `border-color`

### New `.vmem-label` rules

```css
.vmem-label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  opacity: 0;
  max-width: 0;
  margin-left: 0;
  overflow: hidden;
  pointer-events: none;
  transition:
    opacity 200ms ease-smooth,
    max-width 240ms ease-smooth,
    margin-left 240ms ease-smooth;
}

#vmem-popup.expandable:hover .vmem-label {
  opacity: 1;
  max-width: 80px;
  margin-left: 6px;
}
```

Label opacity is 40ms shorter than width → text fades in after pill starts expanding, fades out first on collapse. Never shows clipped text.

### Hover rules — scope to `.expandable` only

Replace `#vmem-popup:hover` with:

```css
#vmem-popup.expandable:hover {
  background: rgba(235, 235, 238, 0.95);
  box-shadow:
    0 1px 3px rgba(16, 24, 40, 0.08),
    0 10px 28px rgba(16, 24, 40, 0.12);
  transform: translateY(-1px);
  width: 152px;
  padding: 8px 14px 8px 10px;
}
#vmem-popup.expandable:active {
  transform: translateY(0);
}
```

During saving/success/error: no `expandable` class = no hover expansion.

### State-specific colors via `color` property

```css
#vmem-popup.state-success {
  background: #dcfce7;
  color: #16a34a;
}
#vmem-popup.state-error {
  background: #fee2e2;
  color: #dc2626;
}
```

### Dark mode media query

```css
@media (prefers-color-scheme: dark) {
  #vmem-popup {
    background: rgba(38, 38, 42, 0.92);
    color: #e4e4e7;
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.3),
      0 6px 16px rgba(0, 0, 0, 0.25);
    border-color: rgba(255, 255, 255, 0.08);
  }
  #vmem-popup.expandable:hover {
    background: rgba(48, 48, 54, 0.95);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.25),
      0 10px 28px rgba(0, 0, 0, 0.3);
  }
  #vmem-popup.state-success {
    background: rgba(22, 101, 52, 0.3);
    color: #16a34a;
  }
  #vmem-popup.state-error {
    background: rgba(153, 27, 27, 0.3);
    color: #dc2626;
  }
  .vmem-spinner {
    border-color: #4a4a50;
    border-top-color: #e4e4e7;
  }
}
```

## Change 4: JS state machine

- Line with `popup.classList.remove(...)`: add `"expandable"` to the removal list
- `case "ready"`: add `"expandable"` to `popup.classList.add("visible", "expandable")`
- Other states (saving/success/error): `expandable` already removed by shared line → popup collapses from pill to circle smoothly (CSS transitions handle animation even while mouse is still hovering, because the selector no longer matches)

## Implementation order

1. SVG `currentColor` changes
2. CSS block replacement (all at once)
3. Label DOM element
4. State machine `expandable` class toggling

## Verification

- `cd apps/chrome-extension && pnpm build`
- Reload extension in `chrome://extensions`
- Test on a light page: hover → pill expands with "Save to vmem" → click → collapses to circle spinner → checkmark
- Test on a dark page (or toggle OS to dark mode): popup should have dark glass background with light icon/text
- Test saving/success/error states don't expand on hover
- Test near right edge: pill may overflow but that's acceptable
