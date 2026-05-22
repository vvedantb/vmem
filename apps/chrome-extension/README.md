# vmem Chrome Extension

Browser extension for saving web content, conversations, bookmarks, and history to vmem.

## Development

From the repo root:

```bash
pnpm install
pnpm ext:dev    # watch build
# or
pnpm ext:build  # one-off production build
```

Load `apps/chrome-extension/dist/` as an unpacked extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked.

Before building, set your deployment URL and Clerk key in `src/lib/constants.ts`.

## Features

- **Export to vmem** — Button injected into ChatGPT/Claude to export conversations as episodic memories
- **Use vmem** — Retrieve relevant memories and prepend as context to your message
- **Save page** — Right-click context menu or popup button to save any page
- **Import bookmarks** — Bulk import browser bookmarks as knowledge memories
- **Import history** — Bulk import browsing history as episodic memories

## Backend

The extension uses `ConvexHttpClient` with Clerk auth and calls `api.memoryApi.*` actions — the same Convex API as the web app. Deferred enrichment runs in the background when WebLLM is available.

Configure the extension from the web dashboard at `/settings/extension`.
