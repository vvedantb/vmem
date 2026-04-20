# Chrome Extension UI Design System Fix Plan

## Context

Chrome extension has some UI elements violating design rules:

- Glass UI on **content cards** (not layout) — should be flat `bg-muted/40`
- Sign in button uses `variant="default"` — should use `variant="outline"` like web app settings
- Header uses `border-b` for separation — should use bg contrast

**NOT violations (clarified):**

- `glass-panel` on main container = OK (layout element)
- `glass-panel-subtle` on TabsList = OK (layout element)
- Button shadows in shared UI = OK (keep existing variants)

---

## Specific Fixes (4 changes)

### 1. QuickSave.tsx — Page preview card (line 141)

```diff
- <div className="glass-panel-subtle rounded-lg p-3 space-y-2">
+ <div className="rounded-lg p-3 space-y-2 bg-muted/40">
```

### 2. QuickSave.tsx — Pending update card (line 173)

```diff
- <div className="space-y-2 rounded-md border border-border p-3">
+ <div className="space-y-2 rounded-md p-3 bg-muted/40">
```

### 3. App.tsx — Sign in button (line 86)

```diff
- <Button variant="default">Sign in</Button>
+ <Button variant="outline">Sign in</Button>
```

### 4. App.tsx — Header separator (line 101)

```diff
- <header className="flex items-center justify-between px-5 py-3.5 border-b border-border/30">
+ <header className="flex items-center justify-between px-5 py-3.5 bg-muted/20">
```

---

## Files to Modify

1. `apps/chrome-extension/src/popup/_components/QuickSave.tsx` — lines 141, 173
2. `apps/chrome-extension/src/popup/App.tsx` — lines 86, 101

---

## Verification

1. Open chrome extension popup
2. Check page preview card — flat bg, no glass effect
3. Check Sign in button — outline style, matches web app settings
4. Check header — no border line, subtle bg tint instead
