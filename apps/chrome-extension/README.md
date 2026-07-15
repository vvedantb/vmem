<!-- AI-generated (Claude), prompt: "write chrome extension readme for vmem" -->
<!-- Modified by me: updated wxt setup and env file steps -->

# vmem Chrome Extension

Browser extension for saving web content, conversations, bookmarks, and history to vmem.

Built with [WXT](https://wxt.dev) (Vite-based MV3 tooling). Entrypoints live under `src/entrypoints/`; packaging is configured in `wxt.config.ts`.

## Development

From the repo root:

```bash
pnpm install
cp apps/chrome-extension/.env.example apps/chrome-extension/.env.local
# edit .env.local with Convex URL + Clerk publishable key

pnpm ext:dev    # WXT watch / HMR → dist/chrome-mv3-dev/
# or
pnpm ext:build  # production build → dist/chrome-mv3/
```

### Load unpacked in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** and select exactly one of:
   - Production: `apps/chrome-extension/dist/chrome-mv3/`
   - Dev watch: `apps/chrome-extension/dist/chrome-mv3-dev/`

Do not load the package root or a flat `dist/` folder — WXT writes under `chrome-mv3` / `chrome-mv3-dev`.

After code changes with `pnpm ext:dev`, most UI updates hot-reload; for background service worker changes, click **Reload** on the extension card.

`pnpm install` runs `wxt prepare` (package `postinstall`) so TypeScript can resolve WXT types. `pnpm --filter @vmem/chrome-extension typecheck` also runs prepare first.

### Smoke checks

- Popup opens from the toolbar icon
- **Alt+S** saves the current page (success/failure toast reflects the real result)
- **Alt+Shift+S** starts a region screenshot when permitted
- ChatGPT / Claude tabs show the injected export / use-vmem controls
- Sign in on the vmem web app first so the extension can read the sync-host session cookie

## Features

- **Export to vmem** — Button injected into ChatGPT/Claude to export conversations as episodic memories
- **Use vmem** — Retrieve relevant memories and prepend as context to your message
- **Save page** — Right-click context menu, popup button, or **Alt+S**
- **Import bookmarks** — Bulk import browser bookmarks as knowledge memories
- **Import history** — Bulk import browsing history as episodic memories

## Backend

The extension uses `ConvexHttpClient` with Clerk auth and calls `api.memoryApi.*` actions — the same Convex API as the web app. Deferred enrichment runs in the background when WebLLM is available.

Configure the extension from the web dashboard at `/settings/extension`.
