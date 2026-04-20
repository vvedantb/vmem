# Chrome Extension Light/Dark Mode Support

## Context

Extension currently hardcoded to dark mode. Web app supports light/dark/system themes synced to Convex `userSettings.theme`. User wants extension to support same theming, synced with web app.

## Key Files

- `apps/chrome-extension/src/popup/globals.css` - Hardcoded dark colors in `@theme` block
- `apps/chrome-extension/src/popup/_components/SettingsForm.tsx` - Settings tab, add theme toggle
- `apps/chrome-extension/src/popup/useExtensionUserSettings.tsx` - Already fetches Convex settings
- `apps/chrome-extension/src/popup/App.tsx` - Integrate theme application
- `apps/web/src/globals.css` - Reference for light/dark color values

## Implementation

### 1. Update `globals.css` — CSS Variables for Light/Dark

Extension uses Tailwind v4 (`@theme` syntax). Restructure to:

- Define `:root` (light) and `.dark` (dark) CSS variable scopes
- Reference variables in `@theme` block
- Update glass panel classes to use variables

```css
/* Light theme (default) */
:root {
  --color-background: oklch(0.965 0.005 95);
  --color-foreground: oklch(0.22 0.01 95);
  /* ... all light colors from web app ... */
}

/* Dark theme */
.dark {
  --color-background: oklch(0.17 0.006 260);
  --color-foreground: oklch(0.965 0.004 260);
  /* ... all dark colors (current values) ... */
}

@theme {
  --color-background: var(--color-background);
  /* ... reference variables ... */
}
```

### 2. Create `useTheme.tsx` Hook

New file: `apps/chrome-extension/src/popup/useTheme.tsx`

- Read theme from `useExtensionUserSettings().settings.theme`
- Handle "system" preference via `window.matchMedia('(prefers-color-scheme: dark)')`
- Apply/remove `.dark` class on `document.documentElement`
- Provide `setTheme(theme)` that calls `update({ theme })`
- Cache resolved theme in sessionStorage for flash prevention

### 3. Add Theme Toggle in `SettingsForm.tsx`

Add dropdown before existing settings:

- Options: Light (sun icon), Dark (moon icon), System (desktop icon)
- Use `Select` component from `@vmem/ui`
- Call `update({ theme })` on change

### 4. Integrate in `App.tsx`

Create `ThemeApplier` component that calls `useTheme()` inside `ExtensionUserSettingsProvider`:

```tsx
function ThemeApplier() {
  useTheme();
  return null;
}

function SignedInContent() {
  return (
    <ExtensionUserSettingsProvider>
      <ThemeApplier />
      {/* ... existing ... */}
    </ExtensionUserSettingsProvider>
  );
}
```

For signed-out users: Apply system preference via `window.matchMedia` (no Convex settings available).

### 5. Flash Prevention (Optional Polish)

Add inline script in `index.html` to apply `.dark` class before React hydrates (check sessionStorage cache or system preference).

## Implementation Order

1. CSS changes first (add light theme, restructure variables)
2. Create useTheme hook
3. Integrate ThemeApplier in App.tsx
4. Add theme selector in SettingsForm
5. Test sync between web app and extension

## Verification

- [ ] Extension respects Convex `userSettings.theme`
- [ ] Theme toggle in Settings tab works
- [ ] Changing theme in web app reflects in extension (real-time via Convex subscription)
- [ ] Changing theme in extension reflects in web app
- [ ] "System" follows OS dark/light mode
- [ ] Signed-out users see system-based theme
- [ ] No flash of wrong theme on popup open
