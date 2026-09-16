# Chrome extension live signed-in matrix

Follow-up to #156/#157. Credentials are env-only (`VMEM_TEST_EMAIL` / `VMEM_TEST_PASSWORD`); they are not in git.

Account: `eva@vedantb.com` against `https://vmem.vedantb.com` (Convex `https://clear-bear-690.eu-west-1.convex.cloud`).

Run: `pnpm ext:build && pnpm --filter @vmem/chrome-extension test:e2e:live`

Headed Chromium 148, unpacked `dist/chrome-mv3`, production Clerk `pk_live_` + FAPI sync host.

## Matrix (2026-09-16)

| Check                         | Result             | Notes                                                                                                                            |
| ----------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Install / unpacked load       | **pass**           | WXT `dist/chrome-mv3`, service worker `background.js`                                                                            |
| Popup signed-out              | **pass**           | “Sign in to start saving memories”; copy no longer says Dev build                                                                |
| Save-page without JWT         | **pass**           | `Not authenticated - please sign in via the extension popup`                                                                     |
| Web sign-in                   | **pass**           | Clerk modal on `vmem.vedantb.com` → `/home` as Eva                                                                               |
| Popup signed-in               | **pass**           | Save / Import / Settings after web session. `chrome.cookies.get(__client)` from the popup is still null; Clerk UI still hydrates |
| Cookie/JWT sync               | **pass**           | `window.Clerk.session.getToken({ template: "convex" })` harvested from the vmem tab → `session:authToken` length 1200            |
| Save page (SW = Alt+S path)   | **pass**           | `memoryId=f5a2fd4f-d981-4c5c-b67d-805a8c90b836`. OS Alt+S does not fire under automation                                         |
| Capture (`captureVisibleTab`) | **pass**           | PNG 24834 bytes from the example.com tab                                                                                         |
| Memory in Convex              | **pass**           | `getMemory(id)` returned title `Example Domain`. `listMemories({ searchQuery: url-marker })` does not match URL-only markers     |
| Cleanup                       | **pass**           | Convex `deleteMemory` removed the test row                                                                                       |
| ChatGPT inject                | **pass (partial)** | Logged-out chatgpt.com: Use vmem inject present. Export control needs signed-in ChatGPT header                                   |

## Cookie jar after web sign-in (names/domains only)

- `__client` — `.clerk.vedantb.com` (HttpOnly)
- `__session` / `__session_*` — `vmem.vedantb.com`
- `__client_uat` — `.vedantb.com`

`@clerk/chrome-extension` still cannot `chrome.cookies.get` that HttpOnly `__client` from the popup in this environment. The product path that unblocks save-page is harvesting the Convex JWT from `window.Clerk` on the signed-in vmem origin (MAIN world `executeScript`), then storing it as `session:authToken`.

## Product fixes in this branch

- Harvest Convex JWT from the signed-in vmem tab; retry while Clerk hydrates
- `TokenSync` does not wipe a harvested JWT when popup `getToken` returns null
- `htmlToMarkdownSafe` so popup `savePage` does not crash Turndown in the MV3 service worker
- Signed-out popup copy no longer prefixed with “Dev build”

## Residual

- Native `chrome.cookies.get({ url: clerk.vedantb.com, name: "__client" })` remains null here. JWT harvest covers save/capture; adding the unpacked extension id to Clerk `allowed_origins` would still help popup `getToken`.
- `getMemory` returned an empty `sourceUrl` even though save-page passed `url`. Create still lands in Convex (title/content/source). Backend `url` vs `sourceUrl` mapping is outside this extension PR.
- ChatGPT **Export** and Claude inject need those sites signed-in.
- Region screenshot overlay (Alt+Shift+S) was not driven live; `captureVisibleTab` was.

## How to re-run

```bash
export VMEM_TEST_EMAIL=eva@vedantb.com
export VMEM_TEST_PASSWORD='…'   # never commit
pnpm ext:build
pnpm --filter @vmem/chrome-extension test:e2e:live
```
