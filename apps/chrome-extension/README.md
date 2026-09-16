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

### Tests

```bash
pnpm --filter @vmem/chrome-extension test      # unit / integration (CI)
pnpm --filter @vmem/chrome-extension test:e2e  # headed Chrome load of dist/chrome-mv3/
pnpm --filter @vmem/chrome-extension test:e2e:live  # signed-in matrix (needs env)
```

Live signed-in coverage is opt-in so CI never sees the test password. Export `VMEM_TEST_EMAIL` and `VMEM_TEST_PASSWORD` in the shell (do not put them in git) then run `test:e2e:live`. The harness signs in on `https://vmem.vedantb.com` in the same Chrome profile as the unpacked extension, checks the popup, saves via **Alt+S**, and deletes the test memory.

Unit tests cover popup copy, save-page toasts, screenshot permission-block, ChatGPT/Claude fixture inject, bookmark/history import cancel, and background handlers. The e2e script is optional: CI does not require Google Chrome, and a blocked MV3 load is recorded rather than treated as a unit-test failure.

Load unpacked from **exactly** `apps/chrome-extension/dist/chrome-mv3/` (production) or `dist/chrome-mv3-dev/` (watch). Do not load the package root.

### Manual checklist (when MV3 load-extension is blocked)

Sign in on `https://vmem.vedantb.com` in the same Chrome profile, then:

1. Popup signed-out vs signed-in (Save / Import / Settings tabs only when signed in)
2. Save page via popup, context menu, and **Alt+S** — toast matches success/failure; memory appears in the dashboard
3. Region screenshot **Alt+Shift+S** on a normal https page; chrome:// / extension pages stay a no-op
4. ChatGPT: Export to vmem + Use vmem inject next to the composer
5. Claude: same
6. Import bookmarks / history (small range) and Cancel — no hang
7. Settings deep-link `https://vmem.vedantb.com/settings/extension` has auto-sync + selection popup, no codebase prompts
8. Delete any memories created during the check

## Features

- **Export to vmem** — Button injected into ChatGPT/Claude to export conversations as episodic memories
- **Use vmem** — Retrieve relevant memories and prepend as context to your message
- **Save page** — Right-click context menu, popup button, or **Alt+S**
- **Import bookmarks** — Bulk import browser bookmarks as knowledge memories
- **Import history** — Bulk import browsing history as episodic memories

## Backend

The extension uses `ConvexHttpClient` with Clerk auth and calls `api.memoryApi.*` actions — the same Convex API as the web app. Deferred enrichment runs in the background when WebLLM is available.

Configure the extension from the web dashboard at `/settings/extension`.
